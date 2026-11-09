create table if not exists public.project_task_deletion_requests (
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

create index if not exists task_deletion_requests_project_status_created_idx
  on public.project_task_deletion_requests(project_id, status, created_at);

create unique index if not exists one_pending_task_deletion_request
  on public.project_task_deletion_requests(task_id)
  where status = 'pending';

alter table public.project_task_deletion_requests enable row level security;

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

create or replace function public.review_project_task_deletion_request(
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
  request_row public.project_task_deletion_requests%rowtype;
  task_title text;
begin
  select *
    into request_row
    from public.project_task_deletion_requests
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
    raise exception 'Solo el propietario puede revisar solicitudes de eliminación.';
  end if;

  if approve then
    select title
      into task_title
      from public.project_tasks
      where id = request_row.task_id
        and project_id = request_row.project_id
      for update;

    if task_title is null then
      raise exception 'La parte del proyecto ya no existe.';
    end if;

    insert into public.project_activity(
      project_id, task_id, actor_id, event_type, message, metadata
    )
    values (
      request_row.project_id,
      null,
      reviewer_uuid,
      'task_deleted',
      'Eliminó la parte del proyecto “' || task_title || '” tras aprobar la solicitud',
      jsonb_build_object('task_title', task_title, 'requested_by', request_row.user_id)
    );

    delete from public.project_tasks
      where id = request_row.task_id
        and project_id = request_row.project_id;
  else
    update public.project_task_deletion_requests
      set status = 'rejected',
          reviewed_at = now(),
          reviewed_by = reviewer_uuid
      where id = request_row.id;
  end if;
end;
$$;

revoke all on function public.review_project_task_deletion_request(uuid, uuid, boolean) from public;
grant execute on function public.review_project_task_deletion_request(uuid, uuid, boolean) to service_role;

notify pgrst, 'reload schema';
