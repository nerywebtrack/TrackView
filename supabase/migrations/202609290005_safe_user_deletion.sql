-- Deleting an auth user must never delete shared data.
--
-- Before this migration, deleting the workspace owner's account cascaded
-- through workspaces -> projects -> board_columns -> tasks -> comments,
-- attachments and assignees, wiping the whole board for everyone.
-- Now:
--   * workspaces.owner_id    -> SET NULL: the workspace survives ownerless and
--                               claim_workspace hands it to the next person who signs in.
--   * profiles.auth_user_id  -> SET NULL: the profile row stays, so their name
--                               keeps showing on comments/assignments they made.
--   * workspace_members      -> unchanged (CASCADE): the membership itself should go.

alter table public.workspaces drop constraint if exists workspaces_owner_id_fkey;
alter table public.workspaces
  add constraint workspaces_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete set null;

alter table public.profiles drop constraint if exists profiles_auth_user_id_fkey;
alter table public.profiles
  add constraint profiles_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on delete set null;

create or replace function public.claim_workspace(target_workspace_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  current_owner uuid;
  workspace_found boolean := false;
  took_ownership integer := 0;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  select true, w.owner_id into workspace_found, current_owner
  from public.workspaces w
  where w.id = target_workspace_id;

  if not coalesce(workspace_found, false) then
    raise exception 'El workspace "%" no existe. Ejecuta supabase/seed.sql para recrearlo.', target_workspace_id
      using errcode = 'P0002';
  end if;

  if current_owner = caller then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace_id, caller, 'owner')
    on conflict (workspace_id, user_id) do update set role = 'owner';
    return;
  end if;

  -- Ownerless (never claimed, or the owner's account was deleted): the first
  -- person to sign in takes it over, even if they were already a member.
  -- The `owner_id is null` guard makes concurrent claims safe: only one wins.
  if current_owner is null then
    update public.workspaces set owner_id = caller
    where id = target_workspace_id and owner_id is null;
    get diagnostics took_ownership = row_count;

    if took_ownership > 0 then
      insert into public.workspace_members (workspace_id, user_id, role)
      values (target_workspace_id, caller, 'owner')
      on conflict (workspace_id, user_id) do update set role = 'owner';
      return;
    end if;
  end if;

  if exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id and wm.user_id = caller
  ) then
    return;
  end if;

  if exists (
    select 1 from public.projects p
    where p.workspace_id = target_workspace_id and p.visibility = 'public'
  ) then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace_id, caller, 'member')
    on conflict do nothing;
    return;
  end if;

  raise exception 'Workspace already belongs to another user';
end;
$$;

grant execute on function public.claim_workspace(text) to authenticated;
