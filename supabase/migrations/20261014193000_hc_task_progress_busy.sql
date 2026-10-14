-- Papan misi & kunci sibuk agent.
-- Progres tugas, hasil (termasuk file), thread asal, dan status gagal kalau tidak ada keluaran.
-- Kunci sibuk lepas sendiri setelah 30 menit tanpa kabar.
-- Balasan di thread tugas tidak lagi langsung menandai selesai: agent-chat yang memutuskan.

alter table public.hc_plan_tasks add column if not exists progress real;
alter table public.hc_plan_tasks add column if not exists progress_note text;
alter table public.hc_plan_tasks add column if not exists result_files jsonb not null default '[]'::jsonb;
alter table public.hc_plan_tasks add column if not exists source_thread_id uuid references public.hc_agent_threads (id) on delete set null;

alter table public.hc_plan_tasks drop constraint if exists hc_plan_tasks_col_check;
alter table public.hc_plan_tasks add constraint hc_plan_tasks_col_check check (col in ('todo', 'doing', 'done', 'failed'));
alter table public.hc_plan_tasks drop constraint if exists hc_plan_tasks_progress_check;
alter table public.hc_plan_tasks add constraint hc_plan_tasks_progress_check check (progress is null or (progress >= 0 and progress <= 1));

create index if not exists hc_plan_tasks_busy_idx on public.hc_plan_tasks (who, updated_at desc) where kind = 'ai' and col = 'doing';

-- token callback hanya untuk service role (jangan ikut select * dari browser)
create table if not exists public.hc_task_callbacks (
  task_id uuid primary key references public.hc_plan_tasks (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.hc_task_callbacks enable row level security;
revoke all on public.hc_task_callbacks from anon, authenticated;

-- selesai tanpa isi -> gagal (n8n kadang mengisi kolom dulu, hasilnya menyusul di update yang sama atau berikutnya)
create or replace function public.hc_plan_tasks_guard_done()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.col = 'done' and coalesce(btrim(new.result), '') = '' then
    new.col := 'failed';
    new.result := 'Tidak ada hasil. Tugas tidak ditandai selesai.';
    new.result_at := coalesce(new.result_at, now());
  end if;
  return new;
end $$;
drop trigger if exists hc_plan_tasks_guard_done on public.hc_plan_tasks;
create trigger hc_plan_tasks_guard_done before update on public.hc_plan_tasks
  for each row execute function public.hc_plan_tasks_guard_done();

-- tugas yang sudah selesai tanpa hasil
update public.hc_plan_tasks
set col = 'failed',
    result = 'Tidak ada hasil. Tugas tidak ditandai selesai.',
    result_at = coalesce(result_at, updated_at, now()),
    updated_at = now()
where kind = 'ai' and col = 'done' and coalesce(btrim(result), '') = '';

-- lepas kunci yang menggantung
create or replace function public.hc_release_stale_agent_tasks(p_minutes int default 30)
returns int
language plpgsql
security definer
set search_path to ''
as $$
declare
  n int := 0;
  r record;
  msg text;
begin
  msg := 'Waktu habis (' || greatest(coalesce(p_minutes, 30), 5) || ' menit tanpa kabar). Tugas dibatalkan supaya agent bisa menerima pekerjaan baru.';
  for r in
    update public.hc_plan_tasks
    set col = 'failed', result = msg, result_at = now(), updated_at = now()
    where kind = 'ai' and col = 'doing' and updated_at < now() - make_interval(mins => greatest(coalesce(p_minutes, 30), 5))
    returning id, title, who, source_thread_id, created_by
  loop
    n := n + 1;
    insert into public.hc_agent_messages (thread_id, role, content, meta)
    select t.id, 'system', left(r.title || ': ' || msg, 2000),
           jsonb_build_object('skip', true, 'kind', 'failed', 'task_id', r.id)
    from public.hc_agent_threads t
    where t.task_id = r.id or t.id = r.source_thread_id;
  end loop;
  return n;
end $$;
revoke all on function public.hc_release_stale_agent_tasks(int) from public, anon, authenticated;
grant execute on function public.hc_release_stale_agent_tasks(int) to service_role;

-- balasan agent di thread tugas / janji chat -> agent-chat (bukan langsung selesai)
create or replace function public.hc_agent_task_reply()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  s text;
  tid uuid;
begin
  if new.role <> 'agent' then return new; end if;
  if coalesce(new.meta ->> 'skip', '') in ('true', '1') then return new; end if;
  if position('[[DELEGATE]]' in new.content) > 0 then return new; end if;
  select task_id into tid from public.hc_agent_threads where id = new.thread_id;
  if tid is null
     and position('[[COMMIT]]' in new.content) = 0
     and new.content !~* 'akan saya kirim|begitu .{0,80}selesai|sedang saya (kerjakan|render|proses|buat)|nanti saya kirim'
  then
    return new;
  end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'hive_webhook_secret' limit 1;
  perform net.http_post(
    url := 'https://ccbyqgisgclqlqatxwbk.supabase.co/functions/v1/agent-chat',
    body := jsonb_build_object('action', 'grok_reply', 'message_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hive-secret', coalesce(s, '')),
    timeout_milliseconds := 8000);
  return new;
end $$;

-- paket Queen: gagal juga mengakhiri penantian, asal ada keterangan
create or replace function public.hc_plan_tasks_delegation_done()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare d record;
begin
  if new.col not in ('done', 'failed') or coalesce(btrim(new.result), '') = '' then return new; end if;
  if old.col in ('done', 'failed') and old.result is not null and old.col = new.col then return new; end if;
  for d in
    select id, task_ids from public.hc_delegations
    where reported_at is null and new.id = any (task_ids)
  loop
    if not exists (
      select 1 from public.hc_plan_tasks t
      where t.id = any (d.task_ids) and (t.col not in ('done', 'failed') or coalesce(btrim(t.result), '') = '')
    ) then
      perform public.hc_delegation_notify(d.id);
    end if;
  end loop;
  return new;
end $$;

-- hasil yang sudah tersimpan tapi tidak pernah masuk chat: buat/lengkapi thread tugas
do $$
declare
  r record;
  tid uuid;
  uid uuid;
begin
  for r in
    select * from public.hc_plan_tasks
    where kind = 'ai' and col = 'done' and coalesce(btrim(result), '') <> ''
  loop
    select id into tid from public.hc_agent_threads where task_id = r.id limit 1;
    if tid is null then
      uid := coalesce(r.created_by, r.updated_by);
      if uid is null then continue; end if;
      insert into public.hc_agent_threads (agent_id, user_id, title, task_id)
      values (r.who, uid, left('Hasil: ' || r.title, 120), r.id)
      returning id into tid;
    end if;
    if exists (
      select 1 from public.hc_agent_messages m
      where m.thread_id = tid and m.role = 'agent'
        and (m.meta ->> 'kind' = 'result' or left(m.content, 80) = left(r.result, 80))
    ) then
      continue;
    end if;
    insert into public.hc_agent_messages (thread_id, role, content, meta)
    values (
      tid, 'agent', left(r.result, 20000),
      jsonb_build_object('skip', true, 'kind', 'result', 'task_id', r.id, 'backfill', true)
    );
    update public.hc_agent_threads set updated_at = now() where id = tid;
  end loop;
end $$;
