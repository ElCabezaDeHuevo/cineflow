alter table public.project_media
  add column if not exists task_id uuid
  references public.project_tasks(id) on delete cascade;

create index if not exists project_media_task_idx
  on public.project_media(task_id, created_at desc);

notify pgrst, 'reload schema';
