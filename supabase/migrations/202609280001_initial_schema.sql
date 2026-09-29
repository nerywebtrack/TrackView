create table if not exists public.profiles (
  id text primary key,
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  display_name text not null,
  initials text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  label text not null default 'Workspace',
  initial text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);

create table if not exists public.projects (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  subtitle text not null default '',
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id text not null references public.projects(id) on delete cascade,
  profile_id text not null references public.profiles(id) on delete cascade,
  primary key (project_id, profile_id)
);

create table if not exists public.board_columns (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  name text not null,
  position integer not null default 0
);

create table if not exists public.tasks (
  id text primary key,
  column_id text not null references public.board_columns(id) on delete cascade,
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assignee_id text references public.profiles(id) on delete set null,
  due_date date not null default current_date,
  files_count integer not null default 0 check (files_count >= 0),
  tags text[] not null default '{}',
  highlighted boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_columns_project_position_idx on public.board_columns(project_id, position);
create index if not exists tasks_column_position_idx on public.tasks(column_id, position);
create index if not exists project_members_project_idx on public.project_members(project_id);

create or replace function public.is_workspace_member(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = target_workspace_id and w.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id and wm.user_id = (select auth.uid())
  );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.board_columns enable row level security;
alter table public.tasks enable row level security;

revoke all on public.profiles, public.workspaces, public.workspace_members, public.projects, public.project_members, public.board_columns, public.tasks from anon, authenticated;
grant select on public.profiles, public.projects, public.project_members, public.board_columns, public.tasks to anon;
grant select, insert, update, delete on public.profiles, public.workspaces, public.workspace_members, public.projects, public.project_members, public.board_columns, public.tasks to authenticated;

create policy "Public profiles are readable" on public.profiles for select using (true);
create policy "Users manage their profile" on public.profiles for all to authenticated
  using (auth_user_id = (select auth.uid())) with check (auth_user_id = (select auth.uid()));

create policy "Members read workspaces" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "Users create workspaces" on public.workspaces for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners update workspaces" on public.workspaces for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners delete workspaces" on public.workspaces for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Members read memberships" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Owners manage memberships" on public.workspace_members for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));

create policy "Public or member projects are readable" on public.projects for select
  using (visibility = 'public' or public.is_workspace_member(workspace_id));
create policy "Members create projects" on public.projects for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "Members update projects" on public.projects for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "Members delete projects" on public.projects for delete to authenticated using (public.is_workspace_member(workspace_id));

create policy "Visible project members are readable" on public.project_members for select
  using (exists (select 1 from public.projects p where p.id = project_id and (p.visibility = 'public' or public.is_workspace_member(p.workspace_id))));
create policy "Workspace members manage project members" on public.project_members for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and public.is_workspace_member(p.workspace_id)));

create policy "Visible columns are readable" on public.board_columns for select
  using (exists (select 1 from public.projects p where p.id = project_id and (p.visibility = 'public' or public.is_workspace_member(p.workspace_id))));
create policy "Members manage columns" on public.board_columns for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and public.is_workspace_member(p.workspace_id)));

create policy "Visible tasks are readable" on public.tasks for select
  using (exists (select 1 from public.board_columns c join public.projects p on p.id = c.project_id where c.id = column_id and (p.visibility = 'public' or public.is_workspace_member(p.workspace_id))));
create policy "Members manage tasks" on public.tasks for all to authenticated
  using (exists (select 1 from public.board_columns c join public.projects p on p.id = c.project_id where c.id = column_id and public.is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.board_columns c join public.projects p on p.id = c.project_id where c.id = column_id and public.is_workspace_member(p.workspace_id)));

create or replace function public.save_project_state(p_project jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_workspace_id text;
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

  delete from public.tasks where column_id in (select id from public.board_columns where project_id = p_project->>'id');
  delete from public.board_columns where project_id = p_project->>'id';

  for column_item in select value, ordinality from jsonb_array_elements(p_project->'columns') with ordinality loop
    insert into public.board_columns (id, project_id, name, position)
    values (column_item.value->>'id', p_project->>'id', column_item.value->>'name', column_item.ordinality - 1);

    for task_item in select value, ordinality from jsonb_array_elements(column_item.value->'tasks') with ordinality loop
      insert into public.tasks (id, column_id, title, description, priority, assignee_id, due_date, files_count, tags, highlighted, position)
      values (
        task_item.value->>'id',
        column_item.value->>'id',
        task_item.value->>'title',
        coalesce(task_item.value->>'description', ''),
        coalesce(task_item.value->>'priority', 'medium'),
        nullif(task_item.value->'assignee'->>'id', ''),
        coalesce(nullif(task_item.value->>'dueDate', '')::date, current_date),
        coalesce((task_item.value->>'filesCount')::integer, 0),
        array(select jsonb_array_elements_text(coalesce(task_item.value->'tags', '[]'::jsonb))),
        coalesce((task_item.value->>'highlighted')::boolean, false),
        task_item.ordinality - 1
      );
    end loop;
  end loop;
end;
$$;

grant execute on function public.is_workspace_member(text) to anon, authenticated;
grant execute on function public.save_project_state(jsonb) to authenticated;

create or replace function public.claim_workspace(target_workspace_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  update public.workspaces set owner_id = (select auth.uid())
  where id = target_workspace_id and owner_id is null;
  if not exists (select 1 from public.workspaces where id = target_workspace_id and owner_id = (select auth.uid())) then
    raise exception 'Workspace already belongs to another user';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_workspace_id, (select auth.uid()), 'owner') on conflict do nothing;
end;
$$;

grant execute on function public.claim_workspace(text) to authenticated;
