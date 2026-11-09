create table if not exists public.project_task_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  created_at timestamptz not null default now()
);

create index if not exists project_task_files_project_task_created_idx
  on public.project_task_files(project_id, task_id, created_at desc);

alter table public.project_task_files enable row level security;

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-task-files', 'project-task-files', false, 20971520)
on conflict (id) do update
  set public = false,
      file_size_limit = 20971520;

notify pgrst, 'reload schema';
