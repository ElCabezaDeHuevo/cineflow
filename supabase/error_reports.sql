create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  details text not null check (length(trim(details)) between 1 and 5000),
  screenshot_path text not null,
  admin_notes text not null default '',
  admin_screenshot_path text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table public.error_reports
  add column if not exists admin_notes text not null default '',
  add column if not exists admin_screenshot_path text;

create index if not exists error_reports_status_created_idx
  on public.error_reports(status, created_at desc);
create index if not exists error_reports_user_created_idx
  on public.error_reports(user_id, created_at desc);

alter table public.error_reports enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'error-report-screenshots',
  'error-report-screenshots',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
