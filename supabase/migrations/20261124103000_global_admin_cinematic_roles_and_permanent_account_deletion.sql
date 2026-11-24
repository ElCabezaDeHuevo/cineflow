begin;

create or replace function public.admin_set_organization_member_cinematic_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_actor_id uuid,
  p_cinematic_role text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.organization_member_cinematic_roles%rowtype;
  v_had_previous boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación no autorizada';
  end if;
  if p_organization_id is null or p_user_id is null or p_actor_id is null
    or p_cinematic_role is null or p_cinematic_role not in (
      'director','assistant-director','producer','executive-producer','line-producer',
      'production-coordinator','screenwriter','script-supervisor','director-of-photography',
      'camera-operator','1st-ac','2nd-ac','gaffer','key-grip','production-designer',
      'art-director','set-designer','props-master','costume-designer','makeup-artist',
      'hair-stylist','casting-director','actor','sound-mixer','boom-operator','editor',
      'colorist','sound-editor','composer','vfx-artist','motion-designer','marketing'
    )
  then
    raise exception 'Empresa, usuario o puesto cinematográfico no válido';
  end if;

  if not exists (select 1 from auth.users where id = p_actor_id) then
    raise exception 'No se encontró la cuenta del administrador que realiza el cambio';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = p_user_id
  ) then
    raise exception 'El usuario no pertenece a la empresa seleccionada';
  end if;

  select * into v_previous
  from public.organization_member_cinematic_roles
  where organization_id = p_organization_id and user_id = p_user_id
  for update;
  v_had_previous := found;

  insert into public.organization_member_cinematic_roles(
    organization_id,user_id,requested_role,approved_role,status,review_reason,
    requested_at,reviewed_by,reviewed_at
  ) values (
    p_organization_id,p_user_id,p_cinematic_role,p_cinematic_role,'approved',
    'Asignado o modificado por el administrador general',now(),p_actor_id,now()
  )
  on conflict (organization_id,user_id) do update
    set requested_role = excluded.requested_role,
        approved_role = excluded.approved_role,
        status = 'approved',
        review_reason = excluded.review_reason,
        requested_at = excluded.requested_at,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at;

  insert into public.organization_audit_log(
    organization_id,actor_id,action,target_type,target_id,metadata
  ) values (
    p_organization_id,p_actor_id,'member_cinematic_role_admin_assigned','user',p_user_id::text,
    jsonb_build_object(
      'previous_role',case when v_had_previous then coalesce(v_previous.approved_role,v_previous.requested_role) else null end,
      'new_role',p_cinematic_role,
      'previous_status',case when v_had_previous then v_previous.status else null end,
      'source','global_admin_panel'
    )
  );
end;
$$;

revoke all on function public.admin_set_organization_member_cinematic_role(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_set_organization_member_cinematic_role(uuid,uuid,uuid,text) to service_role;

create table if not exists public.cineflow_admin_account_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid not null,
  target_email text not null,
  action text not null check (action in ('permanent_account_deletion_pending','permanent_account_deleted','permanent_account_deletion_failed')),
  status text not null check (status in ('pending','completed','failed')),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists cineflow_admin_account_audit_target_idx
  on public.cineflow_admin_account_audit(target_user_id,created_at desc);
create index if not exists cineflow_admin_account_audit_actor_idx
  on public.cineflow_admin_account_audit(actor_id,created_at desc);

alter table public.cineflow_admin_account_audit enable row level security;
revoke all on table public.cineflow_admin_account_audit from public,anon,authenticated;
grant all on table public.cineflow_admin_account_audit to service_role;

commit;
