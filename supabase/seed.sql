-- Minimal bootstrap only: the workspace, project and columns the app expects
-- (`ws-google` / `marketing-campaign` are referenced in src/app/page.tsx and
-- src/app/auth/callback/route.ts). No fake people, tasks or members.
-- Safe to re-run: existing rows are never overwritten.

insert into public.workspaces (id, name, label, initial) values ('ws-google', 'UVGo', 'Workspace', 'U')
on conflict (id) do nothing;

insert into public.projects (id, workspace_id, name, subtitle, visibility) values
  ('marketing-campaign', 'ws-google', 'UVGo', '', 'public')
on conflict (id) do nothing;

-- Only create default columns for a project that has none yet.
insert into public.board_columns (id, project_id, name, position)
select column_id, 'marketing-campaign', column_name, position
from (values ('backlog', 'Backlog', 0), ('in-progress', 'In Progress', 1), ('review', 'Review', 2), ('done', 'Done', 3)) as defaults(column_id, column_name, position)
where not exists (select 1 from public.board_columns where project_id = 'marketing-campaign')
on conflict (id) do nothing;

-- The first person to sign in with Google becomes the owner automatically
-- (/auth/callback calls claim_workspace).
