-- Company-scoped cinematic roles and atomic invitation lifecycle.
-- Branch migration: reviewed and stored in Git only. Do not apply to production yet.

begin;

alter table public.organization_invitations
  add column if not exists accepted_user_id uuid references auth.users(id) on delete set null,
  add column if not exists registration_completed_at timestamptz;

create table if not exists public.organization_member_cinematic_roles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null check (requested_role in (
    'director','assistant-director','producer','executive-producer','line-producer',
    'production-coordinator','screenwriter','script-supervisor','director-of-photography',
    'camera-operator','1st-ac','2nd-ac','gaffer','key-grip','production-designer',
    'art-director','set-designer','props-master','costume-designer','makeup-artist',
    'hair-stylist','casting-director','actor','sound-mixer','boom-operator','editor',
    'colorist','sound-editor','composer','vfx-artist','motion-designer','marketing'
  )),
  approved_role text check (approved_role is null or approved_role in (
    'director','assistant-director','producer','executive-producer','line-producer',
    'production-coordinator','screenwriter','script-supervisor','director-of-photography',
    'camera-operator','1st-ac','2nd-ac','gaffer','key-grip','production-designer',
    'art-director','set-designer','props-master','costume-designer','makeup-artist',
    'hair-stylist','casting-director','actor','sound-mixer','boom-operator','editor',
    'colorist','sound-editor','composer','vfx-artist','motion-designer','marketing'
  )),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_reason text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  primary key (organization_id, user_id),
  constraint organization_member_cinematic_roles_review_state_check check (
    (status = 'pending' and approved_role is null and reviewed_at is null)
    or (status = 'approved' and approved_role is not null and reviewed_at is not null)
    or (status = 'rejected' and approved_role is null and reviewed_at is not null)
  ),
  constraint organization_member_cinematic_roles_reason_length check (
    review_reason is null or char_length(review_reason) <= 300
  )
);

create index if not exists organization_member_cinematic_roles_user_idx
  on public.organization_member_cinematic_roles(user_id, organization_id);
create index if not exists organization_member_cinematic_roles_org_status_idx
  on public.organization_member_cinematic_roles(organization_id, status, requested_at desc);

alter table public.organization_member_cinematic_roles enable row level security;
revoke all on table public.organization_member_cinematic_roles from public, anon, authenticated;
grant select on table public.organization_member_cinematic_roles to authenticated;
grant all on table public.organization_member_cinematic_roles to service_role;

drop policy if exists "Members can view cinematic role requests in their company"
  on public.organization_member_cinematic_roles;
create policy "Members can view cinematic role requests in their company"
  on public.organization_member_cinematic_roles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_organization_member(organization_id)
  );

-- Invitation acceptance, membership creation, and audit are one transaction.
create or replace function public.accept_organization_invitation(
  p_invitation_id uuid,
  p_token_hash text,
  p_user_id uuid,
  p_email text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.organization_invitations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación no autorizada';
  end if;
  if p_user_id is null or p_email is null or p_token_hash is null or p_token_hash = '' then
    raise exception 'Datos de invitación incompletos';
  end if;

  select * into v_invitation
  from public.organization_invitations
  where id = p_invitation_id
  for update;

  if not found
    or v_invitation.accepted_at is not null
    or v_invitation.token_hash is distinct from p_token_hash
    or lower(v_invitation.email) <> lower(p_email)
    or v_invitation.expires_at <= now()
  then
    raise exception 'La invitación no existe, caducó o ya fue utilizada';
  end if;

  if exists (
    select 1 from public.organization_members
    where organization_id = v_invitation.organization_id and user_id = p_user_id
      and role <> v_invitation.role
  ) then
    raise exception 'La cuenta ya pertenece a esta productora con otro permiso';
  end if;

  insert into public.organization_members(organization_id,user_id,role,invited_by)
  values (v_invitation.organization_id,p_user_id,v_invitation.role,v_invitation.invited_by)
  on conflict (organization_id,user_id) do nothing;

  update public.organization_invitations
  set accepted_at = now(), accepted_user_id = p_user_id, token_hash = ''
  where id = p_invitation_id;

  insert into public.organization_audit_log(
    organization_id,actor_id,action,target_type,target_id,metadata
  ) values (
    v_invitation.organization_id,p_user_id,'invitation_accepted','user',p_user_id::text,
    jsonb_build_object('email',lower(p_email),'role',v_invitation.role,'invitation_id',p_invitation_id)
  );

  return v_invitation.organization_id;
end;
$$;

-- A confirmed invite may submit its initial specialty once, only for the invited company.
create or replace function public.complete_organization_invitation_registration(
  p_invitation_id uuid,
  p_user_id uuid,
  p_requested_role text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.organization_invitations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación no autorizada';
  end if;
  if p_requested_role not in (
    'director','assistant-director','producer','executive-producer','line-producer',
    'production-coordinator','screenwriter','script-supervisor','director-of-photography',
    'camera-operator','1st-ac','2nd-ac','gaffer','key-grip','production-designer',
    'art-director','set-designer','props-master','costume-designer','makeup-artist',
    'hair-stylist','casting-director','actor','sound-mixer','boom-operator','editor',
    'colorist','sound-editor','composer','vfx-artist','motion-designer','marketing'
  ) then
    raise exception 'Puesto cinematográfico no válido';
  end if;

  select * into v_invitation
  from public.organization_invitations
  where id = p_invitation_id
  for update;

  if not found
    or v_invitation.accepted_user_id is distinct from p_user_id
    or v_invitation.accepted_at is null
    or v_invitation.registration_completed_at is not null
    or v_invitation.accepted_at < now() - interval '48 hours'
  then
    raise exception 'La invitación no permite completar este registro o ya fue utilizada';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = v_invitation.organization_id and user_id = p_user_id
  ) then
    raise exception 'No se encontró la membresía asociada a la invitación';
  end if;

  insert into public.organization_member_cinematic_roles(
    organization_id,user_id,requested_role,status,requested_at
  ) values (
    v_invitation.organization_id,p_user_id,p_requested_role,'pending',now()
  )
  on conflict (organization_id,user_id) do update
    set requested_role = excluded.requested_role,
        approved_role = null,
        status = 'pending',
        review_reason = null,
        requested_at = now(),
        reviewed_by = null,
        reviewed_at = null;

  update public.organization_invitations
  set registration_completed_at = now()
  where id = p_invitation_id;

  insert into public.organization_audit_log(
    organization_id,actor_id,action,target_type,target_id,metadata
  ) values (
    v_invitation.organization_id,p_user_id,'member_cinematic_role_requested','user',p_user_id::text,
    jsonb_build_object('requested_role',p_requested_role,'invitation_id',p_invitation_id)
  );
end;
$$;

-- Owner/admin review can approve a different role than the one requested.
-- Specialty update and audit event commit atomically.
create or replace function public.review_organization_member_cinematic_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_actor_id uuid,
  p_approved_role text,
  p_status text,
  p_review_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.organization_member_cinematic_roles%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación no autorizada';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'Estado de revisión no válido';
  end if;
  if p_status = 'approved' and p_approved_role not in (
    'director','assistant-director','producer','executive-producer','line-producer',
    'production-coordinator','screenwriter','script-supervisor','director-of-photography',
    'camera-operator','1st-ac','2nd-ac','gaffer','key-grip','production-designer',
    'art-director','set-designer','props-master','costume-designer','makeup-artist',
    'hair-stylist','casting-director','actor','sound-mixer','boom-operator','editor',
    'colorist','sound-editor','composer','vfx-artist','motion-designer','marketing'
  ) then
    raise exception 'Puesto aprobado no válido';
  end if;
  if char_length(coalesce(p_review_reason,'')) > 300 then
    raise exception 'El motivo no puede superar 300 caracteres';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = p_actor_id
      and role in ('owner','admin')
  ) then
    raise exception 'Solo el dueño o administrador puede revisar puestos';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = p_user_id
  ) then
    raise exception 'El integrante no pertenece a esta productora';
  end if;

  select * into v_role
  from public.organization_member_cinematic_roles
  where organization_id = p_organization_id and user_id = p_user_id
  for update;

  if not found or v_role.status <> 'pending' then
    raise exception 'La solicitud ya fue revisada o no existe';
  end if;

  update public.organization_member_cinematic_roles
  set approved_role = case when p_status = 'approved' then p_approved_role else null end,
      status = p_status,
      review_reason = nullif(trim(coalesce(p_review_reason,'')),''),
      reviewed_by = p_actor_id,
      reviewed_at = now()
  where organization_id = p_organization_id and user_id = p_user_id;

  insert into public.organization_audit_log(
    organization_id,actor_id,action,target_type,target_id,metadata
  ) values (
    p_organization_id,p_actor_id,
    case when p_status = 'approved' then 'member_cinematic_role_approved' else 'member_cinematic_role_rejected' end,
    'user',p_user_id::text,
    jsonb_build_object(
      'requested_role',v_role.requested_role,
      'approved_role',case when p_status = 'approved' then p_approved_role else null end,
      'status',p_status,
      'review_reason',nullif(trim(coalesce(p_review_reason,'')),'')
    )
  );
end;
$$;

revoke all on function public.accept_organization_invitation(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.complete_organization_invitation_registration(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.review_organization_member_cinematic_role(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.accept_organization_invitation(uuid,text,uuid,text) to service_role;
grant execute on function public.complete_organization_invitation_registration(uuid,uuid,text) to service_role;
grant execute on function public.review_organization_member_cinematic_role(uuid,uuid,uuid,text,text,text) to service_role;

-- The audit log is written only by trusted server actions and RPCs.
revoke all privileges on table public.organization_audit_log from anon, authenticated;
grant select on table public.organization_audit_log to authenticated;
grant all privileges on table public.organization_audit_log to service_role;

commit;
