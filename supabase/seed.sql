insert into public.profiles (id, display_name, initials, color) values
  ('u-robin', 'Robin Cooper', 'RC', '#f59e0b'),
  ('u-olive', 'Olive Kenji', 'OK', '#8b5cf6'),
  ('u-sophia', 'Sophia Bennett', 'SB', '#ec4899'),
  ('u-marcus', 'Marcus Levin', 'ML', '#0ea5e9'),
  ('u-maya', 'Maya Hart', 'MH', '#10b981'),
  ('u-alex', 'Alex Hill', 'AH', '#6366f1')
on conflict (id) do update set display_name = excluded.display_name, initials = excluded.initials, color = excluded.color;

insert into public.workspaces (id, name, label, initial) values ('ws-google', 'Google LLC', 'Workspace', 'G')
on conflict (id) do nothing;

insert into public.projects (id, workspace_id, name, subtitle, visibility) values
  ('marketing-campaign', 'ws-google', 'Marketing Campaign', 'Assets & deliverables', 'public')
on conflict (id) do nothing;

insert into public.project_members (project_id, profile_id) values
  ('marketing-campaign', 'u-robin'), ('marketing-campaign', 'u-marcus'), ('marketing-campaign', 'u-maya')
on conflict do nothing;

insert into public.board_columns (id, project_id, name, position) values
  ('backlog', 'marketing-campaign', 'Backlog', 0),
  ('in-progress', 'marketing-campaign', 'In Progress', 1),
  ('done', 'marketing-campaign', 'Done', 2),
  ('review', 'marketing-campaign', 'Review', 3)
on conflict (id) do nothing;

insert into public.tasks (id, column_id, title, description, priority, assignee_id, due_date, files_count, tags, highlighted, position) values
  ('t-1', 'backlog', 'Research competitors campaigns', 'Collect data on top-performing campaigns and platforms.', 'low', 'u-olive', '2025-09-25', 56, array['Research','Tech'], false, 0),
  ('t-2', 'backlog', 'Brainstorm content ideas', 'Initial ideas for ad creatives and blog posts.', 'medium', 'u-robin', '2025-09-26', 150, array['Planning'], false, 1),
  ('t-4', 'in-progress', 'Design Instagram creatives', 'Carousel and story visuals with campaign theme.', 'medium', 'u-maya', '2025-10-05', 121, array['Social Media','Planning'], false, 0),
  ('t-8', 'done', 'Audience segmentation', 'Groups defined in CRM with demographics.', 'low', 'u-marcus', '2025-09-25', 81, array['Research','Content'], false, 0),
  ('t-9', 'done', 'SEO audit results', 'Review findings and integrate suggestions.', 'medium', 'u-maya', '2025-09-26', 41, array['Seo','Planning'], true, 1),
  ('t-11', 'review', 'Copywriting for ads', 'Tone, CTAs, and readability review.', 'high', 'u-robin', '2025-09-22', 89, array['Research','Content'], false, 0)
on conflict (id) do nothing;

-- Después de iniciar sesión, reclama el workspace una sola vez desde la app:
-- supabase.rpc('claim_workspace', { target_workspace_id: 'ws-google' })
