-- Video call Cloudflare Realtime, tahap 2: jadwal rapat (kalender), peserta room, dan chat rapat.
-- Tetap satu rapat berjalan pada satu waktu; tiap acara kalender membuka rapatnya sendiri (room = hc_meetings.id).

-- 1) jadwal rapat di kalender Hive Hall
create table if not exists public.hc_meeting_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  starts_at timestamptz not null,
  duration_min int not null default 60 check (duration_min between 5 and 600),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meeting_id uuid references public.hc_meetings (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists hc_meeting_events_starts on public.hc_meeting_events (starts_at);
alter table public.hc_meeting_events enable row level security;
revoke all on public.hc_meeting_events from anon;
drop policy if exists hc_meeting_events_select on public.hc_meeting_events;
create policy hc_meeting_events_select on public.hc_meeting_events for select to authenticated
  using ((select public.hc_my_role()) is not null);
drop policy if exists hc_meeting_events_owner on public.hc_meeting_events;
create policy hc_meeting_events_owner on public.hc_meeting_events for all to authenticated
  using ((select public.hc_my_role()) = 'owner')
  with check ((select public.hc_my_role()) = 'owner');

-- rapat yang dibuka dari jadwal
alter table public.hc_meetings add column if not exists event_id uuid references public.hc_meeting_events (id) on delete set null;

-- 2) siapa sedang di room video beserta track-nya (presence realtime tetap sumber "live";
--    tabel ini catatan yang bertahan dan dasar penegakan "dikeluarkan host")
create table if not exists public.hc_meeting_participants (
  meeting_id uuid not null references public.hc_meetings (id) on delete cascade,
  presence_key text not null check (char_length(presence_key) between 8 and 80),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  pub_session text check (pub_session is null or char_length(pub_session) <= 128),
  tracks jsonb not null default '{}'::jsonb,
  mic boolean not null default true,
  cam boolean not null default true,
  screen boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  kicked_at timestamptz,
  primary key (meeting_id, presence_key)
);
create index if not exists hc_meeting_participants_user on public.hc_meeting_participants (meeting_id, user_id);
alter table public.hc_meeting_participants enable row level security;
revoke all on public.hc_meeting_participants from anon;
drop policy if exists hc_meeting_participants_select on public.hc_meeting_participants;
create policy hc_meeting_participants_select on public.hc_meeting_participants for select to authenticated
  using ((select public.hc_my_role()) is not null);
drop policy if exists hc_meeting_participants_insert on public.hc_meeting_participants;
create policy hc_meeting_participants_insert on public.hc_meeting_participants for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and kicked_at is null
    and (select public.hc_my_role()) in ('owner', 'lead', 'staff')
    -- orang yang sudah dikeluarkan dari rapat ini tidak bisa masuk lagi lewat baris baru
    and not exists (select 1 from public.hc_meeting_participants k where k.meeting_id = hc_meeting_participants.meeting_id and k.user_id = (select auth.uid()) and k.kicked_at is not null)
  );
drop policy if exists hc_meeting_participants_update on public.hc_meeting_participants;
create policy hc_meeting_participants_update on public.hc_meeting_participants for update to authenticated
  using (user_id = (select auth.uid()) and kicked_at is null)
  with check (user_id = (select auth.uid()) and kicked_at is null);
-- kicked_at hanya ditulis Edge Function realtime-session (service role)

-- 3) chat dalam rapat disimpan sebagai baris rapat jenis 'chat'
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relname = 'hc_meeting_lines' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.hc_meeting_lines drop constraint %I', c.conname);
  end loop;
end $$;
-- NOT VALID: hanya berlaku untuk baris baru, baris lama tidak diperiksa ulang
alter table public.hc_meeting_lines add constraint hc_meeting_lines_kind_check
  check (kind in ('speech', 'ai', 'join', 'leave', 'chat')) not valid;
