alter table public.project_messages
  add column if not exists reply_to uuid references public.project_messages(id) on delete set null;

create index if not exists project_messages_project_reply_created_idx
  on public.project_messages (project_id, reply_to, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_messages'
  ) then
    alter publication supabase_realtime add table public.project_messages;
  end if;
end;
$$;
