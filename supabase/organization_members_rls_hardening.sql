-- CineFlow organization membership privilege hardening.
-- Review and apply ONLY on an isolated Supabase staging branch first.
-- Existing SELECT policy is retained; management is split by operation.

DROP POLICY IF EXISTS "Owners and admins can manage organization membership" ON public.organization_members;

CREATE POLICY "Owners and members can view organization membership"
ON public.organization_members
FOR SELECT
TO authenticated
USING (private.is_organization_member(organization_id));

-- Owners may grant any supported organization role.
-- Admins may add only non-privileged roles.
CREATE POLICY "Owners and admins can add permitted members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_organization_member(organization_id, ARRAY['owner']::text[])
  OR (
    role IN ('producer', 'member', 'viewer')
    AND private.is_organization_member(organization_id, ARRAY['admin']::text[])
  )
);

-- Keep user_id and organization_id immutable through this policy.
-- Admins can only edit non-privileged memberships and cannot promote to admin/owner.
CREATE POLICY "Owners and admins can update permitted memberships"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  private.is_organization_member(organization_id, ARRAY['owner']::text[])
  OR (
    role IN ('producer', 'member', 'viewer')
    AND private.is_organization_member(organization_id, ARRAY['admin']::text[])
  )
)
WITH CHECK (
  user_id IS NOT NULL
  AND organization_id IS NOT NULL
  AND (
    private.is_organization_member(organization_id, ARRAY['owner']::text[])
    OR (
      role IN ('producer', 'member', 'viewer')
      AND private.is_organization_member(organization_id, ARRAY['admin']::text[])
    )
  )
);

-- Admins may remove only non-privileged memberships; owners may remove any.
CREATE POLICY "Owners and admins can remove permitted memberships"
ON public.organization_members
FOR DELETE
TO authenticated
USING (
  private.is_organization_member(organization_id, ARRAY['owner']::text[])
  OR (
    role IN ('producer', 'member', 'viewer')
    AND private.is_organization_member(organization_id, ARRAY['admin']::text[])
  )
);
