-- Rekaman rapat video (opsional, flag MEETING_RECORDING=on): direkam di browser host, diunggah per bagian
-- 5 menit ke bucket privat, dan ditautkan di Arsip rapat.

-- bucket privat; batas 100 MB per bagian (±30 MB per 5 menit pada 864 kbps, ada ruang untuk lonjakan)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hc-meeting-recordings', 'hc-meeting-recordings', false, 104857600, array['video/webm', 'video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- unggah hanya owner (host perekam), ke folder <id rapat>/ yang rapatnya sedang berjalan
-- (atau baru selesai: bagian terakhir masih diunggah sesudah rapat diakhiri)
drop policy if exists hc_meeting_recordings_upload on storage.objects;
create policy hc_meeting_recordings_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hc-meeting-recordings'
    and (select public.hc_my_role()) = 'owner'
    and exists (
      select 1 from public.hc_meetings m
      where m.id::text = (storage.foldername(name))[1]
        and (m.status = 'live' or m.ended_at > now() - interval '30 minutes')
    )
  );
-- putar: staff yang bisa membuka Arsip rapat (bukan viewer)
drop policy if exists hc_meeting_recordings_read on storage.objects;
create policy hc_meeting_recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'hc-meeting-recordings' and (select public.hc_my_role()) in ('owner', 'lead', 'staff'));
drop policy if exists hc_meeting_recordings_delete on storage.objects;
create policy hc_meeting_recordings_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hc-meeting-recordings' and (select public.hc_my_role()) = 'owner');

create table if not exists public.hc_meeting_recordings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.hc_meetings (id) on delete cascade,
  part int not null check (part between 1 and 1000),
  path text not null unique check (char_length(path) <= 300),
  mime text not null default 'video/webm',
  size_bytes bigint not null default 0,
  duration_s int not null default 0,
  started_at timestamptz not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists hc_meeting_recordings_meeting on public.hc_meeting_recordings (meeting_id, started_at);
alter table public.hc_meeting_recordings enable row level security;
revoke all on public.hc_meeting_recordings from anon;
drop policy if exists hc_meeting_recordings_select on public.hc_meeting_recordings;
create policy hc_meeting_recordings_select on public.hc_meeting_recordings for select to authenticated
  using ((select public.hc_my_role()) in ('owner', 'lead', 'staff'));
drop policy if exists hc_meeting_recordings_insert on public.hc_meeting_recordings;
create policy hc_meeting_recordings_insert on public.hc_meeting_recordings for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.hc_my_role()) = 'owner');
drop policy if exists hc_meeting_recordings_delete on public.hc_meeting_recordings;
create policy hc_meeting_recordings_delete on public.hc_meeting_recordings for delete to authenticated
  using ((select public.hc_my_role()) = 'owner');
