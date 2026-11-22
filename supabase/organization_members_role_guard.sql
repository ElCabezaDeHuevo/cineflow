-- CineFlow: restrict organization membership role changes.
-- Review and apply manually to a staging database before production.
-- Administrative app actions use the service role; these policies protect
-- direct authenticated Supabase access.

begin;

-- RLS policies invoke this helper as the authenticated caller.
grant execute on function private.is_organization_member(uuid, text[]) to authenticated;

drop policy if exists "Owners and admins can manage organization membership"
  on public.organization_members;

-- Owners may grant owner/admin/member roles. Admins may grant only
-- producer/member/viewer, never owner or another admin.
create policy "Organization managers can add permitted members"
on public.organization_members
for insert
to authenticated
with check (
  (
    role in ('owner', 'admin')
    and private.is_organization_member(organization_id, array['owner']::text[])
  )
  or
  (
    role in ('producer', 'member', 'viewer')
    and private.is_organization_member(organization_id, array['owner', 'admin']::text[])
  )
);

-- Only owners may modify existing owner/admin memberships. Owners and admins
-- may manage lower-privilege memberships, but admins cannot promote them to
-- owner/admin because the WITH CHECK requires an owner for those roles.
create policy "Organization managers can update permitted memberships"
on public.organization_members
for update
to authenticated
using (
  (
    role in ('owner', 'admin')
    and private.is_organization_member(organization_id, array['owner']::text[])
  )
  or
  (
    role in ('producer', 'member', 'viewer')
    and private.is_organization_member(organization_id, array['owner', 'admin']::text[])
  )
)
with check (
  (
    role in ('owner', 'admin')
    and private.is_organization_member(organization_id, array['owner']::text[])
  )
  or
  (
    role in ('producer', 'member', 'viewer')
    and private.is_organization_member(organization_id, array['owner', 'admin']::text[])
  )
);

-- Admins cannot remove owners or other admins.
create policy "Organization managers can remove permitted members"
on public.organization_members
for delete
to authenticated
using (
  (
    role in ('owner', 'admin')
    and private.is_organization_member(organization_id, array['owner']::text[])
  )
  or
  (
    role in ('producer', 'member', 'viewer')
    and private.is_organization_member(organization_id, array['owner', 'admin']::text[])
  )
);

commit;
