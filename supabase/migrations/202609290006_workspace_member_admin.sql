-- Member administration for the project Settings screen: remove/restore
-- members and transfer ownership. All writes go through owner-checked
-- security definer functions; the table itself is read-only to clients.

create table if not exists public.workspace_removed_users (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_removed_users enable row level security;

revoke all on public.workspace_removed_users from anon, authenticated;
grant select on public.workspace_removed_users to authenticated;

create policy "Owners read removed users" on public.workspace_removed_users for select to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_removed_users.workspace_id and w.owner_id = (select auth.uid())
  ));

create or replace function public.assert_workspace_owner(target_workspace_id text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.workspaces w
    where w.id = target_workspace_id and w.owner_id = (select auth.uid())
  ) then
    raise exception 'Solo el dueño del workspace puede administrar miembros' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.remove_workspace_member(target_workspace_id text, member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_workspace_owner(target_workspace_id);
  if member_id = (select auth.uid()) then
    raise exception 'No puedes removerte a ti mismo; transfiere la propiedad primero';
  end if;

  delete from public.workspace_members wm
  where wm.workspace_id = target_workspace_id and wm.user_id = member_id;

  insert into public.workspace_removed_users (workspace_id, user_id)
  values (target_workspace_id, member_id)
  on conflict (workspace_id, user_id) do update set removed_at = now();
end;
$$;

create or replace function public.restore_workspace_member(target_workspace_id text, member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_workspace_owner(target_workspace_id);

  delete from public.workspace_removed_users ru
  where ru.workspace_id = target_workspace_id and ru.user_id = member_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  select target_workspace_id, u.id, 'member' from auth.users u where u.id = member_id
  on conflict (workspace_id, user_id) do nothing;
end;
$$;

create or replace function public.transfer_workspace_ownership(target_workspace_id text, new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  perform public.assert_workspace_owner(target_workspace_id);
  if new_owner_id = caller then
    return;
  end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id and wm.user_id = new_owner_id
  ) then
    raise exception 'La persona debe ser miembro del workspace para recibir la propiedad';
  end if;

  update public.workspaces set owner_id = new_owner_id where id = target_workspace_id;
  update public.workspace_members set role = 'member'
    where workspace_id = target_workspace_id and user_id = caller;
  update public.workspace_members set role = 'owner'
    where workspace_id = target_workspace_id and user_id = new_owner_id;
end;
$$;

-- Same as 202609290005's version, plus: removed users can't rejoin (neither
-- through the public-project auto-join nor by taking over an ownerless workspace).
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

  if exists (
    select 1 from public.workspace_removed_users ru
    where ru.workspace_id = target_workspace_id and ru.user_id = caller
  ) then
    raise exception 'El dueño del workspace te removió. Pídele que te restaure desde Settings.'
      using errcode = '42501';
  end if;

  if current_owner = caller then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace_id, caller, 'owner')
    on conflict (workspace_id, user_id) do update set role = 'owner';
    return;
  end if;

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

revoke execute on function public.assert_workspace_owner(text) from public, anon;
grant execute on function public.remove_workspace_member(text, uuid) to authenticated;
grant execute on function public.restore_workspace_member(text, uuid) to authenticated;
grant execute on function public.transfer_workspace_ownership(text, uuid) to authenticated;
grant execute on function public.claim_workspace(text) to authenticated;
