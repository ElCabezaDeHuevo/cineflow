alter table public.organization_invitations
  add column if not exists short_code_hash text,
  add column if not exists invite_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_invitations'::regclass
      and conname = 'organization_invitations_invite_kind_check'
  ) then
    alter table public.organization_invitations
      add constraint organization_invitations_invite_kind_check
      check (invite_kind is null or invite_kind in ('existing', 'signup'));
  end if;
end;
$$;

create unique index if not exists organization_invitations_short_code_hash_uidx
  on public.organization_invitations (short_code_hash)
  where short_code_hash is not null;
