-- Cineflow: seguimiento operativo, historial detallado y jornadas
create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  stage text not null default 'Desarrollo',
  status text not null default 'pendiente' check (status in ('pendiente','en curso','bloqueada','completada')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_activity (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.project_tasks(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('task_created','task_updated','task_completed','comment','stage_changed','project_updated')),
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (clock_out is null or clock_out >= clock_in)
);

create unique index if not exists one_open_session_per_user
  on public.work_sessions(user_id) where clock_out is null;
create index if not exists project_tasks_project_idx on public.project_tasks(project_id, status, updated_at desc);
create index if not exists project_activity_project_idx on public.project_activity(project_id, created_at desc);
create index if not exists work_sessions_history_idx on public.work_sessions(clock_in desc);

alter table public.project_tasks enable row level security;
alter table public.project_activity enable row level security;
alter table public.work_sessions enable row level security;

drop policy if exists "members can read project tasks" on public.project_tasks;
create policy "members can read project tasks" on public.project_tasks for select to authenticated using (public.is_project_member(project_id));
drop policy if exists "members can create project tasks" on public.project_tasks;
create policy "members can create project tasks" on public.project_tasks for insert to authenticated with check (created_by = auth.uid() and public.is_project_member(project_id, array['owner','editor']));
drop policy if exists "members can update project tasks" on public.project_tasks;
create policy "members can update project tasks" on public.project_tasks for update to authenticated using (public.is_project_member(project_id, array['owner','editor'])) with check (public.is_project_member(project_id, array['owner','editor']));

drop policy if exists "members can read project activity" on public.project_activity;
create policy "members can read project activity" on public.project_activity for select to authenticated using (public.is_project_member(project_id));
drop policy if exists "members can create project activity" on public.project_activity;
create policy "members can create project activity" on public.project_activity for insert to authenticated with check (actor_id = auth.uid() and public.is_project_member(project_id, array['owner','editor']));

drop policy if exists "users can read attendance" on public.work_sessions;
create policy "users can read attendance" on public.work_sessions for select to authenticated using (true);
drop policy if exists "users can clock in" on public.work_sessions;
create policy "users can clock in" on public.work_sessions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users can clock out" on public.work_sessions;
create policy "users can clock out" on public.work_sessions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.touch_project_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  if new.status = 'en curso' and old.status is distinct from new.status and new.started_at is null then new.started_at = now(); end if;
  if new.status = 'completada' and old.status is distinct from new.status and new.completed_at is null then new.completed_at = now(); end if;
  return new;
end; $$;

drop trigger if exists project_tasks_touch on public.project_tasks;
create trigger project_tasks_touch before update on public.project_tasks for each row execute function public.touch_project_task();

create or replace function public.audit_project_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_activity(project_id, task_id, actor_id, event_type, message, metadata)
  values (new.project_id, new.id, auth.uid(), case when new.status = 'completada' then 'task_completed' else 'task_updated' end,
    case when tg_op = 'INSERT' then 'Creó la tarea ' || new.title else 'Actualizó la tarea ' || new.title end,
    jsonb_build_object('status', new.status, 'stage', new.stage, 'assigned_to', new.assigned_to));
  return new;
end; $$;

drop trigger if exists project_tasks_audit on public.project_tasks;
create trigger project_tasks_audit after insert or update on public.project_tasks for each row execute function public.audit_project_task();
