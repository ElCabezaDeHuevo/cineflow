-- CineFlow: restrict organization membership role changes.
-- Review and apply manually to a staging database before production.
-- The application uses the service role for administrative membership changes;
-- these policies protect direct authenticated Supabase access.

begin;

-- RLS policies invoke this helper as the authenticated caller.
grant execute on function private.is_organization_member(uuid, text[]) to authenticated;

drop policy if exists "Owners and admins can manage organization membership"
  on public.organization_members;

create policy "Organization managers can add non-owner members"
on public.organization_members
for insert
to authenticated
with check (
  (
    role <> 'owner'
    and private.is_organization_member(
      organization_id,
      array['owner', 'admin']::text[]
    )
  )
  or
  (
    role = 'owner'
    and private.is_organization_member(
      organization_id,
      array['owner']::text[]
    )
  )
);

create policy "Organization managers can update permitted memberships"
on public.organization_members
for update
to authenticated
using (
  (
    role <> 'owner'
    and private.is_organization_member(
      organization_id,
      array['owner', 'admin']::text[]
    )
  )
  or
  (
    role = 'owner'
    and private.is_organization_member(
      organization_id,
      array['owner']::text[]
    )
  )
)
with check (
  (
    role <> 'owner'
    and private.is_organization_member(
      organization_id,
      array['owner', 'admin']::text[]
    )
  )
  or
  (
    role = 'owner'
    and private.is_organization_member(
      organization_id,
      array['owner']::text[]
    )
  )
);

create policy "Organization managers can remove permitted memberships"
on public.organization_members
for delete
to authenticated
using (
  (
    role <> 'owner'
    and private.is_organization_member(
      organization_id,
      array['owner', 'admin']::text[]
    )
  )
  or
  (
    role = 'owner'
    and private.is_organization_member(
      organization_id,
      array['owner']::text[]
    )
  )
);

commit;
