-- Multiple assignees per task. `tasks.assignee_id` stays as the primary
-- assignee (first in the list) so existing reads keep working.

create table if not exists public.task_assignees (
  task_id text not null references public.tasks(id) on delete cascade,
  profile_id text not null references public.profiles(id) on delete cascade,
  position integer not null default 0,
  primary key (task_id, profile_id)
);

create index if not exists task_assignees_profile_idx on public.task_assignees(profile_id);

insert into public.task_assignees (task_id, profile_id, position)
select t.id, t.assignee_id, 0 from public.tasks t where t.assignee_id is not null
on conflict do nothing;

alter table public.task_assignees enable row level security;

revoke all on public.task_assignees from anon, authenticated;
grant select on public.task_assignees to anon;
grant select, insert, update, delete on public.task_assignees to authenticated;

create policy "Visible assignees are readable" on public.task_assignees for select
  using (exists (
    select 1 from public.tasks t
    join public.board_columns c on c.id = t.column_id
    join public.projects p on p.id = c.project_id
    where t.id = task_assignees.task_id
      and (p.visibility = 'public' or public.is_workspace_member(p.workspace_id))
  ));

create policy "Members manage assignees" on public.task_assignees for all to authenticated
  using (exists (
    select 1 from public.tasks t
    join public.board_columns c on c.id = t.column_id
    join public.projects p on p.id = c.project_id
    where t.id = task_assignees.task_id and public.is_workspace_member(p.workspace_id)
  ))
  with check (exists (
    select 1 from public.tasks t
    join public.board_columns c on c.id = t.column_id
    join public.projects p on p.id = c.project_id
    where t.id = task_assignees.task_id and public.is_workspace_member(p.workspace_id)
  ));

-- Same as 202609290003's version, plus syncing task_assignees from each
-- task's `assignees` array (falls back to `assignee` when the key is absent).
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
  task_assignee_ids text[];
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
      if jsonb_typeof(task_item.value->'assignees') = 'array' then
        select array(
          select x.id from (
            select a.value->>'id' as id, min(a.ord) as first_ord
            from jsonb_array_elements(task_item.value->'assignees') with ordinality as a(value, ord)
            where nullif(a.value->>'id', '') is not null
              and exists (select 1 from public.profiles pr where pr.id = a.value->>'id')
            group by a.value->>'id'
          ) x
          order by x.first_ord
        ) into task_assignee_ids;
      else
        select array(
          select pr.id from public.profiles pr where pr.id = nullif(task_item.value->'assignee'->>'id', '')
        ) into task_assignee_ids;
      end if;

      insert into public.tasks (id, column_id, title, description, priority, assignee_id, start_date, due_date, files_count, tags, highlighted, position)
      values (
        task_item.value->>'id',
        column_item.value->>'id',
        task_item.value->>'title',
        coalesce(task_item.value->>'description', ''),
        coalesce(task_item.value->>'priority', 'medium'),
        coalesce(task_assignee_ids[1], nullif(task_item.value->'assignee'->>'id', '')),
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

      delete from public.task_assignees ta
      where ta.task_id = task_item.value->>'id'
        and not (ta.profile_id = any(task_assignee_ids));

      insert into public.task_assignees (task_id, profile_id, position)
      select task_item.value->>'id', ids.profile_id, ids.ord - 1
      from unnest(task_assignee_ids) with ordinality as ids(profile_id, ord)
      on conflict (task_id, profile_id) do update set position = excluded.position;
    end loop;
  end loop;
end;
$$;

grant execute on function public.save_project_state(jsonb) to authenticated;
