-- Apply only in an isolated Supabase staging branch after review.
-- Keep member self-read policy. Replace broad ALL policy with least-privilege actions.
begin;

drop policy if exists "Owners and admins can manage organization membership" on public.organization_members;

create policy "Organization managers can add non-privileged members"
on public.organization_members
for insert
to authenticated
with check (
  private.is_organization_member(organization_id, array['owner'])
  or (
    private.is_organization_member(organization_id, array['admin'])
    and role in ('producer', 'member', 'viewer')
  )
);

create policy "Organization managers can update allowed memberships"
on public.organization_members
for update
to authenticated
using (
  private.is_organization_member(organization_id, array['owner'])
  or (
    private.is_organization_member(organization_id, array['admin'])
    and role not in ('owner', 'admin')
  )
)
with check (
  private.is_organization_member(organization_id, array['owner'])
  or (
    private.is_organization_member(organization_id, array['admin'])
    and role in ('producer', 'member', 'viewer')
  )
);

create policy "Organization managers can remove allowed memberships"
on public.organization_members
for delete
to authenticated
using (
  private.is_organization_member(organization_id, array['owner'])
  or (
    private.is_organization_member(organization_id, array['admin'])
    and role not in ('owner', 'admin')
  )
);

commit;
