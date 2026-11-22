-- CineFlow: restore authenticated execution for the RLS helper.
-- This is the minimal, non-destructive permission correction.
-- It does not change memberships, roles, RLS policies, or application data.
--
-- Apply first in a staging project, verify authenticated reads/writes, then
-- schedule the same statement for production after approval.

grant execute on function private.is_organization_member(uuid, text[]) to authenticated;
