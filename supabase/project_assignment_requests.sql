create table if not exists public.project_assignment_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists assignment_requests_status_created_idx
  on public.project_assignment_requests(status, created_at);

create unique index if not exists one_pending_assignment_request_per_user_task
  on public.project_assignment_requests(task_id, user_id)
  where status = 'pending';

alter table public.project_assignment_requests enable row level security;

alter table public.project_activity
  drop constraint if exists project_activity_event_type_check;

alter table public.project_activity
  add constraint project_activity_event_type_check
  check (event_type in (
    'task_created',
    'task_updated',
    'task_completed',
    'task_deleted',
    'comment',
    'stage_changed',
    'project_updated'
  ));

create or replace function public.review_project_assignment_request(
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
  request_row public.project_assignment_requests%rowtype;
  updated_task_id uuid;
begin
  select *
    into request_row
    from public.project_assignment_requests
    where id = request_uuid and status = 'pending'
    for update;

  if not found then
    raise exception 'La solicitud ya fue atendida o no existe.';
  end if;

  if approve then
    if not exists (
      select 1
        from public.project_members
        where project_id = request_row.project_id
          and user_id = request_row.user_id
    ) then
      raise exception 'El solicitante ya no pertenece al proyecto.';
    end if;

    update public.project_tasks
      set assigned_to = request_row.user_id
      where id = request_row.task_id
        and project_id = request_row.project_id
        and assigned_to is null
      returning id into updated_task_id;

    if updated_task_id is null then
      raise exception 'La tarea ya tiene responsable o fue eliminada.';
    end if;
  end if;

  update public.project_assignment_requests
    set status = case when approve then 'approved' else 'rejected' end,
        reviewed_at = now(),
        reviewed_by = reviewer_uuid
    where id = request_row.id;
end;
$$;

revoke all on function public.review_project_assignment_request(uuid, uuid, boolean) from public;
grant execute on function public.review_project_assignment_request(uuid, uuid, boolean) to service_role;
