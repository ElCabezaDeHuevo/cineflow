create or replace function public.validate_project_message_reply()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare parent_project_id uuid;
begin
  if new.reply_to is null then return new; end if;
  select project_id into parent_project_id
  from public.project_messages
  where id = new.reply_to;
  if parent_project_id is null or parent_project_id <> new.project_id then
    raise exception 'La respuesta debe enlazar un mensaje del mismo proyecto.';
  end if;
  return new;
end;
$$;

drop trigger if exists project_messages_reply_same_project on public.project_messages;
create trigger project_messages_reply_same_project
before insert or update of project_id, reply_to on public.project_messages
for each row execute function public.validate_project_message_reply();
