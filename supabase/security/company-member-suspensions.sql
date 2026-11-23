-- Company-scoped member suspension with an auditable reactivation history.
create table if not exists public.organization_member_suspensions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  suspended_by uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(trim(reason)) >= 4 and char_length(reason) <= 300),
  suspended_at timestamptz not null default now(),
  reactivated_at timestamptz,
  reactivated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists organization_member_suspensions_one_active_idx
  on public.organization_member_suspensions (organization_id, target_user_id)
  where reactivated_at is null;
create index if not exists organization_member_suspensions_history_idx
  on public.organization_member_suspensions (organization_id, suspended_at desc);

alter table public.organization_member_suspensions enable row level security;
revoke all on table public.organization_member_suspensions from anon, authenticated;
grant all on table public.organization_member_suspensions to service_role;

-- The shared membership predicate is used by organization and project RLS.
-- A suspension therefore blocks direct database access to that company and its projects,
-- while leaving memberships in any other company untouched.
create or replace function private.is_organization_member(
  target_organization uuid,
  allowed_roles text[] default array['owner','admin','producer','member','viewer']::text[]
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_organization
      and om.user_id = (select auth.uid())
      and om.role = any(allowed_roles)
      and not exists (
        select 1 from public.organization_member_suspensions s
        where s.organization_id = om.organization_id
          and s.target_user_id = om.user_id
          and s.reactivated_at is null
      )
  );
$$;

create or replace function private.can_view_profile(target_profile uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select target_profile = (select auth.uid())
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = target_profile
        -- Both sides must be active in this exact shared company.
        and private.is_organization_member(mine.organization_id)
        and not exists (
          select 1 from public.organization_member_suspensions s
          where s.organization_id = theirs.organization_id
            and s.target_user_id = theirs.user_id
            and s.reactivated_at is null
        )
    );
$;

create or replace function public.suspend_organization_member(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_actor_id uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación no autorizada';
  end if;
  if p_actor_id = p_target_user_id then
    raise exception 'No puedes suspender tu propia cuenta';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 4 or char_length(p_reason) > 300 then
    raise exception 'Debes indicar un motivo válido';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = p_actor_id and role = 'owner'
  ) then
    raise exception 'Solo el dueño puede suspender integrantes';
  end if;
  select role into v_role from public.organization_members
  where organization_id = p_organization_id and user_id = p_target_user_id for update;
  if not found then raise exception 'El integrante no pertenece a esta empresa'; end if;
  if v_role = 'owner' then raise exception 'No se puede suspender al dueño de la empresa'; end if;
  if exists (
    select 1 from public.organization_member_suspensions
    where organization_id = p_organization_id and target_user_id = p_target_user_id and reactivated_at is null
  ) then raise exception 'El integrante ya está suspendido'; end if;

  insert into public.organization_member_suspensions (organization_id,target_user_id,suspended_by,reason)
  values (p_organization_id,p_target_user_id,p_actor_id,left(trim(p_reason),300))
  returning id into v_id;

  insert into public.organization_audit_log (organization_id,actor_id,action,target_type,target_id,metadata)
  values (p_organization_id,p_actor_id,'company_member_suspended','user',p_target_user_id::text,
    jsonb_build_object('suspension_id',v_id,'reason',left(trim(p_reason),300),'previous_role',v_role));
  return v_id;
end;
$$;

create or replace function public.reactivate_organization_member(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_actor_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_suspension public.organization_member_suspensions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación no autorizada';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = p_actor_id and role = 'owner'
  ) then
    raise exception 'Solo el dueño puede reactivar integrantes';
  end if;
  select * into v_suspension
  from public.organization_member_suspensions
  where organization_id = p_organization_id and target_user_id = p_target_user_id and reactivated_at is null
  order by suspended_at desc limit 1 for update;
  if not found then raise exception 'No hay una suspensión activa para este integrante'; end if;

  update public.organization_member_suspensions
  set reactivated_at = now(), reactivated_by = p_actor_id
  where id = v_suspension.id;
  insert into public.organization_audit_log (organization_id,actor_id,action,target_type,target_id,metadata)
  values (p_organization_id,p_actor_id,'company_member_reactivated','user',p_target_user_id::text,
    jsonb_build_object('suspension_id',v_suspension.id,'original_reason',v_suspension.reason));
  return v_suspension.id;
end;
$$;

revoke all on function public.suspend_organization_member(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.reactivate_organization_member(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.suspend_organization_member(uuid,uuid,uuid,text) to service_role;
grant execute on function public.reactivate_organization_member(uuid,uuid,uuid) to service_role;

-- Prevent suspended users from reading even their own project_members row.
-- Application server actions use this RLS-scoped read as the authorization gate
-- before any service-role operation.
drop policy if exists "members can read memberships" on public.project_members;
create policy "active organization members can read memberships"
  on public.project_members for select to authenticated
  using (private.is_project_member(project_id));

