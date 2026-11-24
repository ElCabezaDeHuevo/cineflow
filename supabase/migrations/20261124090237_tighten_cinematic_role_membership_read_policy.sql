-- Restrict reads to active members of the same organization.
drop policy if exists "Members can view cinematic role requests in their company"
  on public.organization_member_cinematic_roles;
create policy "Members can view cinematic role requests in their company"
  on public.organization_member_cinematic_roles
  for select to authenticated
  using (private.is_organization_member(organization_id));
