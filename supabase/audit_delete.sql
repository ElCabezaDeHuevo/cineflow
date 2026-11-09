-- Conserva el historial cuando un administrador elimina una parte del proyecto.
alter table public.project_activity
  drop constraint if exists project_activity_task_id_fkey;

alter table public.project_activity
  add constraint project_activity_task_id_fkey
  foreign key (task_id) references public.project_tasks(id) on delete set null;

alter table public.project_activity
  drop constraint if exists project_activity_event_type_check;

alter table public.project_activity
  add constraint project_activity_event_type_check
  check (event_type in ('task_created', 'task_updated', 'task_completed', 'task_deleted', 'comment', 'stage_changed', 'project_updated'));

create or replace function public.log_project_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_activity(project_id, task_id, actor_id, event_type, message, metadata)
  values (
    new.project_id,
    new.id,
    coalesce(new.created_by, auth.uid()),
    case
      when tg_op = 'INSERT' then 'task_created'
      when new.status = 'completada' then 'task_completed'
      else 'task_updated'
    end,
    case
      when tg_op = 'INSERT' then 'Creó la parte del proyecto “' || new.title || '”'
      when new.status = 'completada' then 'Marcó como completada la parte “' || new.title || '”'
      else 'Actualizó la parte “' || new.title || '”'
    end,
    jsonb_build_object('stage', new.stage, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists project_tasks_audit on public.project_tasks;
create trigger project_tasks_audit
after insert or update on public.project_tasks
for each row execute function public.log_project_task_change();

insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', true)
on conflict (id) do update set public = true;

create table if not exists public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.project_tasks(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  storage_path text not null,
  public_url text not null,
  media_type text not null default 'screenshot' check (media_type in ('cover', 'screenshot')),
  caption text not null default '',
  created_at timestamptz not null default now()
);
alter table public.project_media
  add column if not exists task_id uuid references public.project_tasks(id) on delete cascade;
create index if not exists project_media_task_idx on public.project_media(task_id, created_at desc);
alter table public.project_media enable row level security;
drop policy if exists "members can read project media" on public.project_media;
create policy "members can read project media" on public.project_media for select to authenticated using (public.is_project_member(project_id));
drop policy if exists "editors can add project media" on public.project_media;
create policy "editors can add project media" on public.project_media for insert to authenticated with check (uploaded_by = auth.uid() and public.is_project_member(project_id, array['owner','editor']));

drop policy if exists "members can read project media files" on storage.objects;
create policy "members can read project media files" on storage.objects for select to authenticated using (bucket_id = 'project-media');
drop policy if exists "authenticated can upload project media files" on storage.objects;
create policy "authenticated can upload project media files" on storage.objects for insert to authenticated with check (bucket_id = 'project-media');
