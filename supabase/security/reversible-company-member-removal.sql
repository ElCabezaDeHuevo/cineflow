-- Reversible company-member removal. The Auth account and historical records remain intact.
create table if not exists public.organization_member_removals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  target_email text not null default '',
  target_name text not null default '',
  previous_role text not null check (previous_role in ('admin','producer','member','viewer')),
  previous_invited_by uuid,
  previous_joined_at timestamptz not null,
  removed_by uuid references auth.users(id) on delete set null,
  reason text not null,
  removed_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references auth.users(id) on delete set null
);

create unique index if not exists organization_member_removals_one_active_idx
  on public.organization_member_removals (organization_id, target_user_id)
  where restored_at is null;

create index if not exists organization_member_removals_history_idx
  on public.organization_member_removals (organization_id, removed_at desc);

alter table public.organization_member_removals enable row level security;
revoke all on table public.organization_member_removals from anon, authenticated;
grant all on table public.organization_member_removals to service_role;

create or replace function public.remove_organization_member_reversible(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_actor_id uuid,
  p_target_email text,
  p_target_name text,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_joined_at timestamptz;
  v_invited_by uuid;
  v_removal_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación no autorizada';
  end if;
  if p_actor_id = p_target_user_id then
    raise exception 'No puedes darte de baja a ti mismo';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = p_actor_id
      and role = 'owner'
  ) then
    raise exception 'Solo el dueño de la empresa puede dar de baja integrantes';
  end if;

  select role, joined_at, invited_by
    into v_role, v_joined_at, v_invited_by
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = p_target_user_id
  for update;

  if not found then
    raise exception 'El integrante ya no pertenece a esta empresa';
  end if;
  if v_role = 'owner' then
    raise exception 'No se puede dar de baja al dueño de la empresa';
  end if;
  if exists (
    select 1 from public.organization_member_removals
    where organization_id = p_organization_id
      and target_user_id = p_target_user_id
      and restored_at is null
  ) then
    raise exception 'Ya existe una baja activa para este integrante';
  end if;

  insert into public.organization_member_removals (
    organization_id, target_user_id, target_email, target_name,
    previous_role, previous_invited_by, previous_joined_at,
    removed_by, reason
  ) values (
    p_organization_id, p_target_user_id, coalesce(p_target_email, ''),
    coalesce(p_target_name, ''), v_role, v_invited_by,
    coalesce(v_joined_at, now()), p_actor_id, left(trim(p_reason), 300)
  ) returning id into v_removal_id;

  delete from public.organization_members
  where organization_id = p_organization_id and user_id = p_target_user_id;

  insert into public.organization_audit_log (
    organization_id, actor_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id, p_actor_id, 'company_member_removed',
    'user', p_target_user_id::text,
    jsonb_build_object(
      'removal_id', v_removal_id,
      'email', coalesce(p_target_email, ''),
      'name', coalesce(p_target_name, ''),
      'previous_role', v_role,
      'reason', left(trim(p_reason), 300),
      'reversible', true
    )
  );

  return v_removal_id;
end;
$$;

create or replace function public.restore_organization_member(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removal public.organization_member_removals%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación no autorizada';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = p_actor_id
      and role = 'owner'
  ) then
    raise exception 'Solo el dueño de la empresa puede restaurar integrantes';
  end if;

  select * into v_removal
  from public.organization_member_removals
  where organization_id = p_organization_id
    and target_user_id = p_target_user_id
    and restored_at is null
  order by removed_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No se encontró una baja pendiente de restauración';
  end if;
  if exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = p_target_user_id
  ) then
    raise exception 'El integrante ya pertenece a esta empresa';
  end if;

  insert into public.organization_members (
    organization_id, user_id, role, invited_by, joined_at
  ) values (
    p_organization_id, p_target_user_id, v_removal.previous_role,
    v_removal.previous_invited_by, v_removal.previous_joined_at
  );

  update public.organization_member_removals
  set restored_at = now(), restored_by = p_actor_id
  where id = v_removal.id;

  insert into public.organization_audit_log (
    organization_id, actor_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id, p_actor_id, 'company_member_restored',
    'user', p_target_user_id::text,
    jsonb_build_object(
      'removal_id', v_removal.id,
      'email', v_removal.target_email,
      'previous_role', v_removal.previous_role
    )
  );

  return v_removal.id;
end;
$$;

revoke all on function public.remove_organization_member_reversible(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.restore_organization_member(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_organization_member_reversible(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.restore_organization_member(uuid, uuid, uuid) to service_role;
