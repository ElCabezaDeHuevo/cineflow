create policy "CineFlow owner can create projects"
on public.projects
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (select auth.uid()) = '0a12ae9b-a119-42f8-8103-4f1bf3ab5467'::uuid
  and organization_id is not null
  and private.organization_has_access(organization_id)
);
