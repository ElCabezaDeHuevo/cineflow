create or replace function public.is_cineflow_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users au
    where au.id = target_user
      and au.raw_app_meta_data ->> 'cineflow_role' = 'admin'
  );
$$;

revoke all on function public.is_cineflow_admin(uuid) from public;
grant execute on function public.is_cineflow_admin(uuid) to authenticated;

create table if not exists public.user_profile_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  note text not null check (length(trim(note)) between 1 and 5000),
  screenshot_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profile_notes_user_created_idx
  on public.user_profile_notes(user_id, created_at desc);
create index if not exists user_profile_notes_author_idx
  on public.user_profile_notes(author_id, created_at desc);

alter table public.user_profile_notes enable row level security;

drop policy if exists "authenticated users can read profile notes" on public.user_profile_notes;
drop policy if exists "admins can read profile notes" on public.user_profile_notes;
create policy "admins can read profile notes" on public.user_profile_notes
for select to authenticated using (public.is_cineflow_admin(auth.uid()));

drop policy if exists "admins can write profile notes" on public.user_profile_notes;
create policy "admins can write profile notes" on public.user_profile_notes for insert to authenticated with check (
  author_id = auth.uid()
  and public.is_cineflow_admin(auth.uid())
);
