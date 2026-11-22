-- Security hardening for project request review RPCs.
-- Branch artifact only: do not apply to production until reviewed and approved.
-- The membership RPC previously trusted reviewer_uuid without binding it to auth.uid().
-- That allowed a caller to impersonate a project owner by supplying the owner's UUID.

CREATE OR REPLACE FUNCTION public.review_project_membership_request(
  request_uuid uuid,
  reviewer_uuid uuid,
  approve boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  request_row public.project_membership_requests%rowtype;
  project_org uuid;
begin
  if auth.uid() is null or reviewer_uuid is distinct from auth.uid() then
    raise exception 'Identidad de revisor no válida.';
  end if;

  select *
    into request_row
    from public.project_membership_requests
    where id = request_uuid and status = 'pending'
    for update;

  if not found then
    raise exception 'La solicitud ya fue atendida o no existe.';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = request_row.project_id
      and pm.user_id = auth.uid()
      and pm.role = 'owner'
  ) then
    raise exception 'Solo el propietario puede revisar solicitudes para este proyecto.';
  end if;

  if approve then
    select p.organization_id into project_org
    from public.projects p
    where p.id = request_row.project_id;

    if project_org is null or not exists (
      select 1 from public.organization_members om
      where om.organization_id = project_org
        and om.user_id = request_row.user_id
    ) then
      raise exception 'El solicitante no pertenece a la productora de este proyecto.';
    end if;

    insert into public.project_members(project_id, user_id, role)
    values (request_row.project_id, request_row.user_id, 'editor')
    on conflict (project_id, user_id) do nothing;
  end if;

  update public.project_membership_requests
  set status = case when approve then 'approved' else 'rejected' end,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = request_row.id;
end;
$function$;

-- These functions must only be callable by authenticated sessions.
REVOKE ALL ON FUNCTION public.review_project_membership_request(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_project_membership_request(uuid, uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.review_project_leave_request(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_project_leave_request(uuid, uuid, boolean) TO authenticated;
