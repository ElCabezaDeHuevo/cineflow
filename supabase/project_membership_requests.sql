create table if not exists public.project_membership_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists project_membership_requests_project_status_created_idx
  on public.project_membership_requests(project_id, status, created_at);

create unique index if not exists one_pending_membership_request_per_user_project
  on public.project_membership_requests(project_id, user_id)
  where status = 'pending';

alter table public.project_membership_requests enable row level security;

create or replace function public.review_project_membership_request(
  request_uuid uuid,
  reviewer_uuid uuid,
  approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.project_membership_requests%rowtype;
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
    select 1
      from public.project_members
      where project_id = request_row.project_id
        and user_id = reviewer_uuid
        and role = 'owner'
  ) then
    raise exception 'Solo el propietario puede revisar solicitudes para este proyecto.';
  end if;

  if approve then
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
$$;

revoke all on function public.review_project_membership_request(uuid, uuid, boolean) from public;
grant execute on function public.review_project_membership_request(uuid, uuid, boolean) to service_role;

notify pgrst, 'reload schema';
