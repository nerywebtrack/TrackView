-- Task activity log, designed for reporting: tasks completed per day and per
-- person, lead time (created -> done), cycle time (first "in progress" -> done)
-- and time spent in each state.
--
-- Design choices:
--   * Rows are written by triggers (security definer), never by the client,
--     so every change is captured even if it comes straight from the API.
--   * No foreign keys to tasks/columns/projects: history must survive when a
--     task or column is deleted. Titles, column names/kinds and assignees are
--     snapshotted at the time of each event.
--   * Each column gets a `kind` (todo | active | done) so "done" no longer
--     depends on the column being literally named "Done".
--   * Reporting views group by day in America/Guatemala time.
--   * Only changes from this migration onward are tracked; existing tasks get a
--     single backfilled "created" event using their original created_at.

-- 1. Column kinds ------------------------------------------------------------

alter table public.board_columns add column if not exists kind text not null default 'active';
alter table public.board_columns drop constraint if exists board_columns_kind_check;
alter table public.board_columns add constraint board_columns_kind_check check (kind in ('todo', 'active', 'done'));

update public.board_columns set kind = case
  when lower(trim(name)) in ('done', 'terminado', 'terminada', 'completado', 'completada', 'finalizado', 'hecho') then 'done'
  when lower(trim(name)) in ('backlog', 'to do', 'todo', 'por hacer', 'pendiente', 'pendientes') then 'todo'
  else 'active'
end;

-- 2. Activity table ------------------------------------------------------------

create table if not exists public.task_activity (
  id bigint generated always as identity primary key,
  project_id text not null,
  task_id text not null,
  task_title text,
  actor_id text,
  action text not null check (action in (
    'created', 'status_changed', 'updated', 'deleted',
    'assignee_added', 'assignee_removed',
    'comment_added', 'attachment_added', 'attachment_removed'
  )),
  field text,
  old_value jsonb,
  new_value jsonb,
  from_column_id text,
  from_column_name text,
  from_column_kind text,
  to_column_id text,
  to_column_name text,
  to_column_kind text,
  assignees jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_task_idx on public.task_activity(task_id, created_at);
create index if not exists task_activity_project_idx on public.task_activity(project_id, created_at);
create index if not exists task_activity_status_idx on public.task_activity(project_id, to_column_kind, created_at)
  where action in ('created', 'status_changed');

alter table public.task_activity enable row level security;

revoke all on public.task_activity from anon, authenticated;
grant select on public.task_activity to authenticated;

create policy "Workspace members read activity" on public.task_activity for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = task_activity.project_id and public.is_workspace_member(p.workspace_id)
  ));

-- 3. Helpers -------------------------------------------------------------------

create or replace function public.current_profile_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id from public.profiles pr where pr.auth_user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.task_assignee_snapshot(p_task_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.display_name) order by ta.position)
     from public.task_assignees ta
     join public.profiles pr on pr.id = ta.profile_id
     where ta.task_id = p_task_id),
    (select jsonb_build_array(jsonb_build_object('id', pr.id, 'name', pr.display_name))
     from public.tasks t
     join public.profiles pr on pr.id = t.assignee_id
     where t.id = p_task_id),
    '[]'::jsonb
  );
$$;

-- 4. Triggers ------------------------------------------------------------------

-- save_project_state upserts every task on every save; only bump updated_at
-- when something about the task actually changed.
create or replace function public.touch_task_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.column_id, new.title, new.description, new.priority, new.assignee_id, new.start_date, new.due_date, new.files_count, new.tags, new.highlighted)
     is not distinct from
     (old.column_id, old.title, old.description, old.priority, old.assignee_id, old.start_date, old.due_date, old.files_count, old.tags, old.highlighted) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at before update on public.tasks
  for each row execute function public.touch_task_updated_at();

create or replace function public.log_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.current_profile_id();
  v_project text;
  v_from_name text;
  v_from_kind text;
  v_to_name text;
  v_to_kind text;
begin
  if tg_op = 'INSERT' then
    select c.project_id, c.name, c.kind into v_project, v_to_name, v_to_kind
    from public.board_columns c where c.id = new.column_id;
    if v_project is null then return new; end if;
    insert into public.task_activity (project_id, task_id, task_title, actor_id, action, to_column_id, to_column_name, to_column_kind, assignees)
    values (v_project, new.id, new.title, v_actor, 'created', new.column_id, v_to_name, v_to_kind, public.task_assignee_snapshot(new.id));
    return new;
  end if;

  if tg_op = 'DELETE' then
    select c.project_id, c.name, c.kind into v_project, v_from_name, v_from_kind
    from public.board_columns c where c.id = old.column_id;
    -- Column already gone (deleted in the same cascade): nothing to attach it to.
    if v_project is null then return old; end if;
    insert into public.task_activity (project_id, task_id, task_title, actor_id, action, from_column_id, from_column_name, from_column_kind, assignees)
    values (v_project, old.id, old.title, v_actor, 'deleted', old.column_id, v_from_name, v_from_kind, public.task_assignee_snapshot(old.id));
    return old;
  end if;

  select c.project_id, c.name, c.kind into v_project, v_to_name, v_to_kind
  from public.board_columns c where c.id = new.column_id;
  if v_project is null then return new; end if;

  if old.column_id is distinct from new.column_id then
    select c.name, c.kind into v_from_name, v_from_kind from public.board_columns c where c.id = old.column_id;
    insert into public.task_activity (project_id, task_id, task_title, actor_id, action, from_column_id, from_column_name, from_column_kind, to_column_id, to_column_name, to_column_kind, assignees)
    values (v_project, new.id, new.title, v_actor, 'status_changed', old.column_id, v_from_name, v_from_kind, new.column_id, v_to_name, v_to_kind, public.task_assignee_snapshot(new.id));
  end if;

  insert into public.task_activity (project_id, task_id, task_title, actor_id, action, field, old_value, new_value, to_column_id, to_column_name, to_column_kind)
  select v_project, new.id, new.title, v_actor, 'updated', changes.field, changes.old_value, changes.new_value, new.column_id, v_to_name, v_to_kind
  from (values
    ('title', to_jsonb(old.title), to_jsonb(new.title)),
    ('description', to_jsonb(old.description), to_jsonb(new.description)),
    ('priority', to_jsonb(old.priority), to_jsonb(new.priority)),
    ('start_date', to_jsonb(old.start_date), to_jsonb(new.start_date)),
    ('due_date', to_jsonb(old.due_date), to_jsonb(new.due_date)),
    ('tags', to_jsonb(old.tags), to_jsonb(new.tags)),
    ('highlighted', to_jsonb(old.highlighted), to_jsonb(new.highlighted))
  ) as changes(field, old_value, new_value)
  where changes.old_value is distinct from changes.new_value;

  return new;
end;
$$;

drop trigger if exists tasks_log_change on public.tasks;
create trigger tasks_log_change after insert or update or delete on public.tasks
  for each row execute function public.log_task_change();

create or replace function public.log_task_child_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_task_id text := v_row->>'task_id';
  v_project text;
  v_title text;
  v_column_id text;
  v_column_name text;
  v_column_kind text;
  v_action text;
  v_value jsonb;
begin
  select c.project_id, t.title, t.column_id, c.name, c.kind
    into v_project, v_title, v_column_id, v_column_name, v_column_kind
  from public.tasks t join public.board_columns c on c.id = t.column_id
  where t.id = v_task_id;
  -- Parent task already deleted (cascade): the task's own "deleted" event covers it.
  if v_project is null then return null; end if;

  if tg_table_name = 'task_assignees' then
    v_action := case when tg_op = 'INSERT' then 'assignee_added' else 'assignee_removed' end;
    select jsonb_build_object('id', pr.id, 'name', pr.display_name) into v_value
    from public.profiles pr where pr.id = v_row->>'profile_id';
  elsif tg_table_name = 'task_comments' then
    v_action := 'comment_added';
    v_value := jsonb_build_object('comment_id', v_row->>'id', 'body', left(v_row->>'body', 280), 'parent_id', v_row->>'parent_id');
  else
    v_action := case when tg_op = 'INSERT' then 'attachment_added' else 'attachment_removed' end;
    v_value := jsonb_build_object('attachment_id', v_row->>'id', 'name', v_row->>'file_name', 'kind', v_row->>'kind');
  end if;

  insert into public.task_activity (project_id, task_id, task_title, actor_id, action, new_value, to_column_id, to_column_name, to_column_kind)
  values (v_project, v_task_id, v_title, public.current_profile_id(), v_action, v_value, v_column_id, v_column_name, v_column_kind);
  return null;
end;
$$;

drop trigger if exists task_assignees_log_change on public.task_assignees;
create trigger task_assignees_log_change after insert or delete on public.task_assignees
  for each row execute function public.log_task_child_change();

drop trigger if exists task_comments_log_change on public.task_comments;
create trigger task_comments_log_change after insert on public.task_comments
  for each row execute function public.log_task_child_change();

drop trigger if exists task_attachments_log_change on public.task_attachments;
create trigger task_attachments_log_change after insert or delete on public.task_attachments
  for each row execute function public.log_task_child_change();

-- 5. Backfill: one "created" event per existing task (no history before this) --

insert into public.task_activity (project_id, task_id, task_title, action, new_value, to_column_id, to_column_name, to_column_kind, assignees, created_at)
select c.project_id, t.id, t.title, 'created', '{"backfilled": true}'::jsonb, t.column_id, c.name, c.kind, public.task_assignee_snapshot(t.id), t.created_at
from public.tasks t
join public.board_columns c on c.id = t.column_id
where not exists (select 1 from public.task_activity a where a.task_id = t.id and a.action = 'created');

-- 6. Reporting views (security_invoker: the caller's RLS applies) --------------

-- Every stretch of time a task spent in a state. `left_at` is null while it's still there.
create or replace view public.task_status_periods with (security_invoker = true) as
select
  a.project_id,
  a.task_id,
  a.task_title,
  a.to_column_id as column_id,
  a.to_column_name as column_name,
  a.to_column_kind as column_kind,
  a.assignees,
  a.created_at as entered_at,
  lead(a.created_at) over w as left_at,
  coalesce(lead(a.created_at) over w, now()) - a.created_at as duration
from public.task_activity a
where a.action in ('created', 'status_changed')
window w as (partition by a.task_id order by a.created_at, a.id);

-- One row each time a task enters a "done" state. A task reopened and
-- finished again appears twice; use the latest row per task if that matters.
create or replace view public.task_completions with (security_invoker = true) as
select
  a.id as activity_id,
  a.project_id,
  a.task_id,
  a.task_title,
  a.actor_id as completed_by,
  a.assignees,
  a.created_at as completed_at,
  (a.created_at at time zone 'America/Guatemala')::date as completed_day,
  created.created_at as task_created_at,
  started.started_at,
  a.created_at - created.created_at as lead_time,
  a.created_at - started.started_at as cycle_time
from public.task_activity a
left join lateral (
  select min(x.created_at) as created_at from public.task_activity x
  where x.task_id = a.task_id and x.action = 'created'
) created on true
left join lateral (
  select min(x.created_at) as started_at from public.task_activity x
  where x.task_id = a.task_id and x.action in ('created', 'status_changed')
    and x.to_column_kind = 'active' and x.created_at <= a.created_at
) started on true
where a.action in ('created', 'status_changed')
  and a.to_column_kind = 'done'
  and a.from_column_kind is distinct from 'done';

-- Per day and per assignee (a task with 2 assignees counts once for each).
create or replace view public.daily_task_stats with (security_invoker = true) as
select
  tc.project_id,
  tc.completed_day,
  person->>'id' as assignee_id,
  coalesce(person->>'name', 'Sin asignar') as assignee_name,
  count(*) as tasks_completed,
  round((avg(extract(epoch from tc.cycle_time)) / 3600)::numeric, 2) as avg_cycle_hours,
  round((avg(extract(epoch from tc.lead_time)) / 3600)::numeric, 2) as avg_lead_hours
from public.task_completions tc
cross join lateral jsonb_array_elements(
  case when jsonb_array_length(tc.assignees) > 0 then tc.assignees else '[{}]'::jsonb end
) as person
group by tc.project_id, tc.completed_day, person->>'id', person->>'name';

grant select on public.task_status_periods, public.task_completions, public.daily_task_stats to authenticated;

-- 7. save_project_state: same as 202609290004 plus column `kind` -----------------

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
    insert into public.board_columns (id, project_id, name, position, kind)
    values (
      column_item.value->>'id',
      p_project->>'id',
      column_item.value->>'name',
      column_item.ordinality - 1,
      case when column_item.value->>'kind' in ('todo', 'active', 'done') then column_item.value->>'kind' else 'active' end
    )
    on conflict (id) do update set
      project_id = excluded.project_id,
      name = excluded.name,
      position = excluded.position,
      -- A client that predates `kind` (an old open tab) must not reset it.
      kind = case when column_item.value ? 'kind' then excluded.kind else public.board_columns.kind end;

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
