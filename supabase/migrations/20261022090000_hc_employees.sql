-- Data karyawan (halaman Employee) + undangan lewat email.
-- Owner mengelola semua karyawan; kepala divisi (lead) hanya karyawan divisi utamanya.
-- Data pribadi (TTL, telepon, kontak darurat) tidak terlihat staff lain.

create table if not exists public.hc_employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  nickname text not null check (char_length(nickname) between 1 and 40),
  gender text not null check (gender in ('L', 'P')),
  birth_place text not null check (char_length(birth_place) between 2 and 80),
  birth_date date not null check (birth_date between date '1940-01-01' and current_date),
  photo_path text not null check (char_length(photo_path) <= 300),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text not null check (phone ~ '^\+?[0-9 ()-]{8,20}$'),
  emergency_name text not null check (char_length(emergency_name) between 2 and 120),
  emergency_relation text not null check (char_length(emergency_relation) between 2 and 40),
  emergency_phone text not null check (emergency_phone ~ '^\+?[0-9 ()-]{8,20}$'),
  -- penempatan & peran yang dikunci ke undangan
  primary_dept text not null default 'ops',
  depts text[] not null default '{}',
  role text not null default 'staff' check (role in ('owner', 'lead', 'staff', 'viewer')),
  -- undangan
  invite_code text,
  invited_at timestamptz,
  invite_status text check (invite_status in ('sent', 'existing_account')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists hc_employees_email on public.hc_employees (lower(email));
alter table public.hc_employees enable row level security;
revoke all on public.hc_employees from anon;

-- owner: semua; lead: karyawan di divisi utamanya, dan tidak bisa membuat/menjadikan owner atau lead
drop policy if exists hc_employees_select on public.hc_employees;
create policy hc_employees_select on public.hc_employees for select to authenticated
  using (
    (select public.hc_my_role()) = 'owner'
    or ((select public.hc_my_role()) = 'lead' and primary_dept = (select p.primary_dept from public.hc_profiles p where p.id = (select auth.uid())))
  );
drop policy if exists hc_employees_insert on public.hc_employees;
create policy hc_employees_insert on public.hc_employees for insert to authenticated
  with check (
    (select public.hc_my_role()) = 'owner'
    or ((select public.hc_my_role()) = 'lead' and role in ('staff', 'viewer')
        and primary_dept = (select p.primary_dept from public.hc_profiles p where p.id = (select auth.uid())))
  );
drop policy if exists hc_employees_update on public.hc_employees;
create policy hc_employees_update on public.hc_employees for update to authenticated
  using (
    (select public.hc_my_role()) = 'owner'
    or ((select public.hc_my_role()) = 'lead' and primary_dept = (select p.primary_dept from public.hc_profiles p where p.id = (select auth.uid())))
  )
  with check (
    (select public.hc_my_role()) = 'owner'
    or ((select public.hc_my_role()) = 'lead' and role in ('staff', 'viewer')
        and primary_dept = (select p.primary_dept from public.hc_profiles p where p.id = (select auth.uid())))
  );
drop policy if exists hc_employees_delete on public.hc_employees;
create policy hc_employees_delete on public.hc_employees for delete to authenticated
  using ((select public.hc_my_role()) = 'owner');

-- foto karyawan: bucket privat, hanya owner & lead
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hc-employee-photos', 'hc-employee-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists hc_employee_photos_rw on storage.objects;
create policy hc_employee_photos_rw on storage.objects for all to authenticated
  using (bucket_id = 'hc-employee-photos' and (select public.hc_my_role()) in ('owner', 'lead'))
  with check (bucket_id = 'hc-employee-photos' and (select public.hc_my_role()) in ('owner', 'lead'));
