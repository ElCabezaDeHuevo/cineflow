-- CineFlow tenant isolation hardening
-- Keep organization-owned data isolated even if a stale project membership exists.

create or replace function private.is_project_member(
  target_project uuid,
  allowed_roles text[] default array['owner','editor','viewer']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.project_id = target_project
      and pm.user_id = (select auth.uid())
      and pm.role = any(allowed_roles)
      and p.organization_id is not null
      and private.is_organization_member(p.organization_id)
  );
$function$;

create or replace function public.is_project_member(
  target_project uuid,
  allowed_roles text[] default array['owner','editor','viewer']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.project_id = target_project
      and pm.user_id = (select auth.uid())
      and pm.role = any(allowed_roles)
      and p.organization_id is not null
      and private.is_organization_member(p.organization_id)
  );
$function$;

-- Project profiles are visible only inside the same company, not merely
-- because two accounts happen to share a project membership record.
create or replace function private.can_view_profile(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select target_profile = (select auth.uid())
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = target_profile
    );
$function$;

-- All projects must have an owning company. Current production contains no
-- project rows, so this constraint does not orphan existing data.
alter table public.projects
  alter column organization_id set not null;

-- Private profile notes are restricted to CineFlow platform administrators.
drop policy if exists "authenticated users can read profile notes"
  on public.user_profile_notes;
drop policy if exists "admins can read profile notes"
  on public.user_profile_notes;
create policy "admins can read profile notes"
  on public.user_profile_notes
  for select to authenticated
  using (public.is_cineflow_admin((select auth.uid())));

-- project-media objects are stored under <project_uuid>/<filename>.
-- Restrict both listing and direct reads/uploads to the owning project's members.
drop policy if exists "authenticated can upload project media files"
  on storage.objects;
drop policy if exists "members can read project media files"
  on storage.objects;
drop policy if exists "organization project members can read project media"
  on storage.objects;
drop policy if exists "project editors can upload project media"
  on storage.objects;

create policy "organization project members can read project media"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-media'
    and exists (
      select 1
      from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and private.is_project_member(p.id, array['owner','editor','viewer']::text[])
    )
  );

create policy "project editors can upload project media"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-media'
    and exists (
      select 1
      from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and private.is_project_member(p.id, array['owner','editor']::text[])
    )
  );

-- Requests are intentionally service-role-only: application server actions
-- authenticate the actor and verify project/company membership before writes.
-- Do not add permissive authenticated policies to these tables.
