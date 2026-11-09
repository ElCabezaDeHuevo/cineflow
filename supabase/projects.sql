create extension if not exists "pgcrypto";
create table if not exists public.projects (id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) > 0), type text not null check (length(trim(type)) > 0), stage text not null check (length(trim(stage)) > 0), owner_role text not null check (length(trim(owner_role)) > 0), start_date date not null, delivery_date date not null check (delivery_date >= start_date), description text not null default '', created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.project_members (project_id uuid not null references public.projects(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role text not null check (role in ('owner', 'editor', 'viewer')), created_at timestamptz not null default now(), primary key (project_id, user_id));
create table if not exists public.project_audit_log (id bigint generated always as identity primary key, project_id uuid not null references public.projects(id) on delete cascade, user_id uuid references auth.users(id) on delete set null, action text not null check (action in ('INSERT', 'UPDATE')), changed_at timestamptz not null default now());
create or replace function public.is_project_member(target_project uuid, allowed_roles text[] default array['owner','editor','viewer']) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.project_members where project_id = target_project and user_id = auth.uid() and role = any(allowed_roles)); $$;
create or replace function public.add_project_owner() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.project_members(project_id, user_id, role) values (new.id, new.created_by, 'owner'); return new; end; $$;
create or replace function public.audit_project_change() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.project_audit_log(project_id, user_id, action) values (new.id, auth.uid(), TG_OP); new.updated_at = now(); return new; end; $$;
drop trigger if exists projects_add_owner on public.projects; create trigger projects_add_owner after insert on public.projects for each row execute function public.add_project_owner();
drop trigger if exists projects_audit on public.projects; create trigger projects_audit before insert or update on public.projects for each row execute function public.audit_project_change();
alter table public.projects enable row level security; alter table public.project_members enable row level security; alter table public.project_audit_log enable row level security;
drop policy if exists "members can read projects" on public.projects; create policy "members can read projects" on public.projects for select using (public.is_project_member(id));
drop policy if exists "authenticated users can create projects" on public.projects; create policy "authenticated users can create projects" on public.projects for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "editors can update projects" on public.projects; create policy "editors can update projects" on public.projects for update using (public.is_project_member(id, array['owner','editor'])) with check (public.is_project_member(id, array['owner','editor']));
drop policy if exists "members can read memberships" on public.project_members; create policy "members can read memberships" on public.project_members for select using (public.is_project_member(project_id));
drop policy if exists "members can read audit" on public.project_audit_log; create policy "members can read audit" on public.project_audit_log for select using (public.is_project_member(project_id));

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text not null default '',
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data->>'full_name', '') from auth.users
on conflict (id) do nothing;

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', '')) on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;
drop policy if exists "authenticated users can read profiles" on public.profiles;
create policy "authenticated users can read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

