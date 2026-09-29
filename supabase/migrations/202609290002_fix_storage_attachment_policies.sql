-- Bug fix: the three storage.objects policies from 202609290001 wrote
-- `(storage.foldername(name))[1]` inside `... from public.projects p where
-- p.id = ...`. Since `public.projects` also has a column called `name` (the
-- project's display name), Postgres silently resolved the unqualified `name`
-- to `p.name` instead of the intended `storage.objects.name` (the uploaded
-- file's path). A project's display name never contains a "/", so
-- storage.foldername() on it always returned an empty array, making the
-- `p.id = (...)[1]` comparison always false — every attachment upload,
-- read and delete failed RLS for every user, regardless of membership.
-- Fixed by qualifying the object path explicitly as `storage.objects.name`.

drop policy if exists "Read attachments of visible projects" on storage.objects;
drop policy if exists "Members upload attachments" on storage.objects;
drop policy if exists "Members delete attachments" on storage.objects;

create policy "Read attachments of visible projects" on storage.objects for select
  using (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from public.projects p
      where p.id = (storage.foldername(storage.objects.name))[1]
        and (p.visibility = 'public' or public.is_workspace_member(p.workspace_id))
    )
  );

create policy "Members upload attachments" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from public.projects p
      where p.id = (storage.foldername(storage.objects.name))[1]
        and public.is_workspace_member(p.workspace_id)
    )
  );

create policy "Members delete attachments" on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from public.projects p
      where p.id = (storage.foldername(storage.objects.name))[1]
        and public.is_workspace_member(p.workspace_id)
    )
  );
