-- Project Ticket view: timeline start date, persistent comments with replies,
-- and link attachments (alongside uploaded files).
-- Every policy qualifies the target table's own columns explicitly — see
-- 202609290002 for what happens when a bare column name gets shadowed.

alter table public.tasks add column if not exists start_date date;

alter table public.task_attachments add column if not exists kind text not null default 'file';
alter table public.task_attachments add column if not exists url text;
alter table public.task_attachments alter column storage_path drop not null;
alter table public.task_attachments drop constraint if exists task_attachments_kind_check;
alter table public.task_attachments add constraint task_attachments_kind_check check (
  (kind = 'file' and storage_path is not null) or (kind = 'link' and url is not null)
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks(id) on delete cascade,
  parent_id uuid references public.task_comments(id) on delete cascade,
  author_id text references public.profiles(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on public.task_comments(task_id, created_at);

alter table public.task_comments enable row level security;

revoke all on public.task_comments from anon, authenticated;
grant select on public.task_comments to anon;
grant select, insert, delete on public.task_comments to authenticated;

create policy "Visible comments are readable" on public.task_comments for select
  using (exists (
    select 1 from public.tasks t
    join public.board_columns c on c.id = t.column_id
    join public.projects p on p.id = c.project_id
    where t.id = task_comments.task_id
      and (p.visibility = 'public' or public.is_workspace_member(p.workspace_id))
  ));

create policy "Members write their own comments" on public.task_comments for insert to authenticated
  with check (
    task_comments.author_id = (select auth.uid())::text
    and exists (
      select 1 from public.tasks t
      join public.board_columns c on c.id = t.column_id
      join public.projects p on p.id = c.project_id
      where t.id = task_comments.task_id and public.is_workspace_member(p.workspace_id)
    )
  );

create policy "Authors delete their own comments" on public.task_comments for delete to authenticated
  using (task_comments.author_id = (select auth.uid())::text);

-- Same as 202609290001's version plus start_date.
create or replace function public.save_project_state(p_project jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_workspace_id text;
  incoming_column_ids text[];
  incoming_task_ids text[];
  column_item record;
  task_item record;
begin
  select workspace_id into project_workspace_id from public.projects where id = p_project->>'id';
  if project_workspace_id is null or not public.is_workspace_member(project_workspace_id) then
    raise exception 'Not authorized to update this project';
  end if;

  update public.projects set
    name = p_project->>'name',
    subtitle = coalesce(p_project->>'subtitle', ''),
    visibility = coalesce(p_project->>'visibility', 'private'),
    updated_at = now()
  where id = p_project->>'id';

  select array(select value->>'id' from jsonb_array_elements(p_project->'columns'))
    into incoming_column_ids;

  select array(
    select t.value->>'id'
    from jsonb_array_elements(p_project->'columns') as c(value)
    cross join lateral jsonb_array_elements(c.value->'tasks') as t(value)
  ) into incoming_task_ids;

  delete from public.tasks
  where column_id in (select id from public.board_columns where project_id = p_project->>'id')
    and not (id = any(coalesce(incoming_task_ids, array[]::text[])));

  delete from public.board_columns
  where project_id = p_project->>'id'
    and not (id = any(coalesce(incoming_column_ids, array[]::text[])));

  for column_item in select value, ordinality from jsonb_array_elements(p_project->'columns') with ordinality loop
    insert into public.board_columns (id, project_id, name, position)
    values (column_item.value->>'id', p_project->>'id', column_item.value->>'name', column_item.ordinality - 1)
    on conflict (id) do update set
      project_id = excluded.project_id,
      name = excluded.name,
      position = excluded.position;

    for task_item in select value, ordinality from jsonb_array_elements(column_item.value->'tasks') with ordinality loop
      insert into public.tasks (id, column_id, title, description, priority, assignee_id, start_date, due_date, files_count, tags, highlighted, position)
      values (
        task_item.value->>'id',
        column_item.value->>'id',
        task_item.value->>'title',
        coalesce(task_item.value->>'description', ''),
        coalesce(task_item.value->>'priority', 'medium'),
        nullif(task_item.value->'assignee'->>'id', ''),
        nullif(task_item.value->>'startDate', '')::date,
        coalesce(nullif(task_item.value->>'dueDate', '')::date, current_date),
        coalesce((task_item.value->>'filesCount')::integer, 0),
        array(select jsonb_array_elements_text(coalesce(task_item.value->'tags', '[]'::jsonb))),
        coalesce((task_item.value->>'highlighted')::boolean, false),
        task_item.ordinality - 1
      )
      on conflict (id) do update set
        column_id = excluded.column_id,
        title = excluded.title,
        description = excluded.description,
        priority = excluded.priority,
        assignee_id = excluded.assignee_id,
        start_date = excluded.start_date,
        due_date = excluded.due_date,
        files_count = excluded.files_count,
        tags = excluded.tags,
        highlighted = excluded.highlighted,
        position = excluded.position,
        updated_at = now();
    end loop;
  end loop;
end;
$$;

grant execute on function public.save_project_state(jsonb) to authenticated;
