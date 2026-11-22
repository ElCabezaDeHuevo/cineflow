-- Draft only: apply to an isolated staging database after reviewing role behavior.
-- Replace the broad ALL policy with operation-specific policies and an UPDATE guard.

DROP POLICY IF EXISTS "Owners and admins can manage organization membership" ON public.organization_members;

-- Preserve the existing SELECT policy; it already limits rows to organization members.

CREATE POLICY "Owners and admins can insert permitted memberships"
ON public.organization_members FOR INSERT TO authenticated
WITH CHECK (
  private.is_organization_member(organization_id, ARRAY['owner']::text[])
  OR (
    role IN ('producer', 'member', 'viewer')
    AND private.is_organization_member(organization_id, ARRAY['admin']::text[])
  )
);

CREATE POLICY "Owners and admins can update permitted memberships"
ON public.organization_members FOR UPDATE TO authenticated
USING (
  private.is_organization_member(organization_id, ARRAY['owner']::text[])
  OR (
    role IN ('producer', 'member', 'viewer')
    AND private.is_organization_member(organization_id, ARRAY['admin']::text[])
  )
)
WITH CHECK (
  private.is_organization_member(organization_id, ARRAY['owner']::text[])
  OR (
    role IN ('producer', 'member', 'viewer')
    AND private.is_organization_member(organization_id, ARRAY['admin']::text[])
  )
);

CREATE POLICY "Owners and admins can delete permitted memberships"
ON public.organization_members FOR DELETE TO authenticated
USING (
  private.is_organization_member(organization_id, ARRAY['owner']::text[])
  OR (
    role IN ('producer', 'member', 'viewer')
    AND private.is_organization_member(organization_id, ARRAY['admin']::text[])
  )
);

CREATE OR REPLACE FUNCTION private.guard_organization_membership_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Organization and user identifiers cannot be changed';
  END IF;

  IF NOT private.is_organization_member(OLD.organization_id, ARRAY['owner']::text[]) THEN
    IF NOT private.is_organization_member(OLD.organization_id, ARRAY['admin']::text[])
       OR OLD.role NOT IN ('producer', 'member', 'viewer')
       OR NEW.role NOT IN ('producer', 'member', 'viewer') THEN
      RAISE EXCEPTION 'Insufficient privileges to update this membership';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_organization_membership_update ON public.organization_members;
CREATE TRIGGER guard_organization_membership_update
BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION private.guard_organization_membership_update();
