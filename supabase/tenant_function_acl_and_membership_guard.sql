-- Restrict privileged helper execution and prevent cross-company project membership.
revoke all on function public.is_project_member(uuid, text[]) from public, anon;
grant execute on function public.is_project_member(uuid, text[]) to authenticated, service_role;

revoke all on function private.is_project_member(uuid, text[]) from public, anon;
grant execute on function private.is_project_member(uuid, text[]) to authenticated, service_role;

revoke all on function private.can_view_profile(uuid) from public, anon;
grant execute on function private.can_view_profile(uuid) to authenticated, service_role;

create or replace function public.review_project_membership_request(
  request_uuid uuid,
  reviewer_uuid uuid,
  approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_row public.project_membership_requests%rowtype;
  project_org uuid;
begin
  select *
    into request_row
    from public.project_membership_requests
    where id = request_uuid and status = 'pending'
    for update;

  if not found then
    raise exception 'La solicitud ya fue atendida o no existe.';
  end if;

  if not exists (
    select 1 from public.project_members pm
    where pm.project_id = request_row.project_id
      and pm.user_id = reviewer_uuid
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
      reviewed_by = reviewer_uuid
  where id = request_row.id;
end;
$function$;

revoke all on function public.review_project_membership_request(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.review_project_membership_request(uuid, uuid, boolean) to service_role;
