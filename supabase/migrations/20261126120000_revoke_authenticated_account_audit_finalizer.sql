-- Restrict audit finalization to trusted server-side service-role callers.
-- Do not apply to the shared project until Preview has an isolated Supabase branch.
begin;

revoke execute on function public.finalize_cineflow_account_audit(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_cineflow_account_audit(uuid, text, jsonb)
  to service_role;

commit;
