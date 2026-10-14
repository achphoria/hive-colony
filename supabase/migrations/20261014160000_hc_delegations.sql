-- Queen Bea sebagai ketua: setiap delegasi dari percakapan dicatat sebagai satu paket kerja.
-- Begitu semua tugas di paket itu selesai (ada hasilnya), agent-chat (action 'queen_report')
-- dipanggil untuk mengirim rekap + lampiran hasil lengkap ke percakapan asal.

create table if not exists public.hc_delegations (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.hc_agent_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  request text,
  task_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  reported_at timestamptz
);
create index if not exists hc_delegations_open_idx on public.hc_delegations using gin (task_ids) where reported_at is null;
alter table public.hc_delegations enable row level security;
drop policy if exists hc_delegations_select on public.hc_delegations;
create policy hc_delegations_select on public.hc_delegations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.hc_my_role()) = 'owner');
-- tulis hanya lewat Edge Function (service role)

-- panggil agent-chat untuk satu paket
create or replace function public.hc_delegation_notify(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'hive_webhook_secret' limit 1;
  perform net.http_post(
    url := 'https://ccbyqgisgclqlqatxwbk.supabase.co/functions/v1/agent-chat',
    body := jsonb_build_object('action', 'queen_report', 'delegation_id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hive-secret', coalesce(s, '')),
    timeout_milliseconds := 5000);
end $$;
revoke all on function public.hc_delegation_notify(uuid) from public, anon, authenticated;

-- tugas selesai (ada hasil) -> cek paket yang memuatnya; semua selesai -> minta laporan
create or replace function public.hc_plan_tasks_delegation_done()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare d record;
begin
  if new.col <> 'done' or new.result is null then return new; end if;
  if old.col = 'done' and old.result is not null then return new; end if;
  for d in
    select id, task_ids from public.hc_delegations
    where reported_at is null and new.id = any (task_ids)
  loop
    if not exists (
      select 1 from public.hc_plan_tasks t
      where t.id = any (d.task_ids) and (t.col <> 'done' or t.result is null)
    ) then
      perform public.hc_delegation_notify(d.id);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists hc_plan_tasks_delegation_done on public.hc_plan_tasks;
create trigger hc_plan_tasks_delegation_done after update on public.hc_plan_tasks
  for each row execute function public.hc_plan_tasks_delegation_done();
