-- CineFlow production security hardening
-- Applied to Supabase project hhfiupszhzhmivmbvpou on 2026-11-22.
-- This file records the exact idempotent SQL already applied in production.
-- Membership mutations must go through validated server actions using service_role.
-- Do not grant direct INSERT/UPDATE/DELETE to authenticated clients.

begin;

drop policy if exists "Owners and admins can manage organization membership"
  on public.organization_members;

drop policy if exists "organization invitations visible to managers"
  on public.organization_invitations;

drop policy if exists "organization audit visible to managers"
  on public.organization_audit_log;

revoke all privileges on table public.organization_members from anon, authenticated;
grant select on table public.organization_members to authenticated;

revoke all on function public.is_project_member(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.is_project_member(uuid, text[])
  to service_role;

commit;

-- Expected state:
-- * RLS remains enabled on organization_members.
-- * Authenticated users can SELECT memberships subject to the existing RLS policy.
-- * Browser clients cannot INSERT, UPDATE, DELETE, TRUNCATE, or alter memberships.
-- * service_role server actions retain their privileges and bypass RLS.
-- * The private.is_project_member helper used by RLS policies remains unchanged.
-- * Only one manager SELECT policy remains on invitations and audit log.
