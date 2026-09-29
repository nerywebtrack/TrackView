create or replace function public.claim_workspace(target_workspace_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select owner_id into current_owner
  from public.workspaces
  where id = target_workspace_id;

  if current_owner = (select auth.uid())
     or exists (
       select 1 from public.workspace_members
       where workspace_id = target_workspace_id and user_id = (select auth.uid())
     ) then
    return;
  end if;

  if current_owner is null then
    update public.workspaces
    set owner_id = (select auth.uid())
    where id = target_workspace_id and owner_id is null;
    insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace_id, (select auth.uid()), 'owner')
    on conflict do nothing;
    return;
  end if;

  -- The seeded demo workspace is public, so authenticated users can join it
  -- without taking ownership from the original owner.
  if exists (
    select 1 from public.projects
    where workspace_id = target_workspace_id and visibility = 'public'
  ) then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace_id, (select auth.uid()), 'member')
    on conflict do nothing;
    return;
  end if;

  raise exception 'Workspace already belongs to another user';
end;
$$;
