-- The "deleted" event was logged from an AFTER DELETE trigger. By then the
-- ON DELETE CASCADE on task_assignees had already removed the task's
-- assignees (FK cascade triggers fire first), so the snapshot came out empty
-- and deleted tasks showed up as "Sin asignar" in reports. Log it BEFORE the
-- delete instead; if the delete fails the activity row rolls back with it.

create or replace function public.log_task_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project text;
  v_from_name text;
  v_from_kind text;
begin
  select c.project_id, c.name, c.kind into v_project, v_from_name, v_from_kind
  from public.board_columns c where c.id = old.column_id;
  if v_project is null then return old; end if;
  insert into public.task_activity (project_id, task_id, task_title, actor_id, action, from_column_id, from_column_name, from_column_kind, assignees)
  values (v_project, old.id, old.title, public.current_profile_id(), 'deleted', old.column_id, v_from_name, v_from_kind, public.task_assignee_snapshot(old.id));
  return old;
end;
$$;

drop trigger if exists tasks_log_deleted on public.tasks;
create trigger tasks_log_deleted before delete on public.tasks
  for each row execute function public.log_task_deleted();

drop trigger if exists tasks_log_change on public.tasks;
create trigger tasks_log_change after insert or update on public.tasks
  for each row execute function public.log_task_change();

-- Repair deletions already logged with an empty snapshot, using the most
-- recent non-empty snapshot from earlier events of the same task.
update public.task_activity deleted
set assignees = (
  select a.assignees from public.task_activity a
  where a.task_id = deleted.task_id and a.id < deleted.id and jsonb_array_length(a.assignees) > 0
  order by a.id desc limit 1
)
where deleted.action = 'deleted'
  and jsonb_array_length(deleted.assignees) = 0
  and exists (
    select 1 from public.task_activity a
    where a.task_id = deleted.task_id and a.id < deleted.id and jsonb_array_length(a.assignees) > 0
  );
