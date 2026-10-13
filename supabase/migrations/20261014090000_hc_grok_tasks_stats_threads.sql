-- Grok Bot untuk tugas & delegasi, statistik & kuota pesan, sematkan/ganti judul percakapan.

-- ---------- percakapan: sematkan + tautan ke tugas (thread tugas Grok Bot) ----------
alter table public.hc_agent_threads add column if not exists pinned boolean not null default false;
alter table public.hc_agent_threads add column if not exists task_id uuid references public.hc_plan_tasks (id) on delete set null;
create index if not exists hc_agent_threads_task_idx on public.hc_agent_threads (task_id) where task_id is not null;
alter table public.hc_agent_threads drop constraint if exists hc_agent_threads_title_len;
alter table public.hc_agent_threads add constraint hc_agent_threads_title_len check (char_length(title) between 1 and 120) not valid;

-- pemilik percakapan hanya boleh mengubah judul & sematan (kolom lain dikunci)
revoke update on public.hc_agent_threads from authenticated;
grant update (title, pinned) on public.hc_agent_threads to authenticated;
drop policy if exists hc_agent_threads_update on public.hc_agent_threads;
create policy hc_agent_threads_update on public.hc_agent_threads for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- balasan agent di thread tugas -> hasil tugas papan rencana + selesai ----------
create or replace function public.hc_agent_task_reply()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  tid uuid;
  t record;
begin
  if new.role <> 'agent' then return new; end if;
  select task_id into tid from public.hc_agent_threads where id = new.thread_id;
  if tid is null then return new; end if;
  update public.hc_plan_tasks
    set result = left(new.content, 20000), result_at = now(), col = 'done', updated_at = now()
    where id = tid
    returning title, who into t;
  if found then
    insert into public.hc_activity (kind, dept, text)
    select 'agent_reply', p.dept, left('Selesai: ' || t.title, 280)
    from public.hc_agent_prompts p where p.agent_id = t.who;
  end if;
  return new;
end $$;
drop trigger if exists hc_agent_messages_task_reply on public.hc_agent_messages;
create trigger hc_agent_messages_task_reply after insert on public.hc_agent_messages
  for each row execute function public.hc_agent_task_reply();

-- ---------- Queen Bea mode Grok: balasan berisi [[DELEGATE]] diproses agent-chat ----------
create or replace function public.hc_agent_grok_delegate_notify()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  s text;
  ag text;
begin
  if new.role <> 'agent' or coalesce(new.meta ->> 'engine', '') <> 'grokbot' or position('[[DELEGATE]]' in new.content) = 0 then
    return new;
  end if;
  select agent_id into ag from public.hc_agent_threads where id = new.thread_id;
  if ag is distinct from 'ceo' then return new; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'hive_webhook_secret' limit 1;
  perform net.http_post(
    url := 'https://ccbyqgisgclqlqatxwbk.supabase.co/functions/v1/agent-chat',
    body := jsonb_build_object('action', 'grok_delegate', 'message_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hive-secret', coalesce(s, '')),
    timeout_milliseconds := 5000);
  return new;
end $$;
drop trigger if exists hc_agent_messages_grok_delegate on public.hc_agent_messages;
create trigger hc_agent_messages_grok_delegate after insert on public.hc_agent_messages
  for each row execute function public.hc_agent_grok_delegate_notify();

-- ---------- kuota pesan harian ----------
-- pesan yang saya kirim hari ini (WIB), tanpa thread tugas
create or replace function public.hc_my_usage_today()
returns int
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int
  from public.hc_agent_messages m
  join public.hc_agent_threads t on t.id = m.thread_id
  where t.user_id = auth.uid()
    and t.task_id is null
    and m.role = 'user'
    and m.created_at >= ((now() at time zone 'Asia/Jakarta')::date)::timestamp at time zone 'Asia/Jakarta';
$$;
revoke all on function public.hc_my_usage_today() from public, anon;
grant execute on function public.hc_my_usage_today() to authenticated;

create or replace function public.hc_get_limits()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select case when public.hc_my_role() is null then null
    else coalesce((select value from public.hc_system_status where key = 'limits'), '{"daily_per_staff": 0}'::jsonb) end;
$$;
revoke all on function public.hc_get_limits() from public, anon;
grant execute on function public.hc_get_limits() to authenticated;

-- owner mengatur batas pesan per staff per hari (0 = tanpa batas)
create or replace function public.hc_set_limits(p_daily int)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v jsonb;
begin
  if public.hc_my_role() is distinct from 'owner' then raise exception 'owner_only' using errcode = '42501'; end if;
  if p_daily is null or p_daily < 0 or p_daily > 2000 then raise exception 'bad_limit' using errcode = '22023'; end if;
  v := jsonb_build_object('daily_per_staff', p_daily);
  insert into public.hc_system_status (key, value, checked_at) values ('limits', v, now())
    on conflict (key) do update set value = excluded.value, checked_at = excluded.checked_at;
  return v;
end $$;
revoke all on function public.hc_set_limits(int) from public, anon;
grant execute on function public.hc_set_limits(int) to authenticated;

-- ---------- statistik pemakaian agent (khusus owner) ----------
create or replace function public.hc_agent_stats(p_days int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare r jsonb;
begin
  if public.hc_my_role() is distinct from 'owner' then raise exception 'owner_only' using errcode = '42501'; end if;
  with m as (
    select msg.role, msg.content, msg.meta, msg.created_at, t.agent_id, t.user_id, t.task_id,
           lag(msg.role) over w as prev_role, lag(msg.created_at) over w as prev_at
    from public.hc_agent_messages msg
    join public.hc_agent_threads t on t.id = msg.thread_id
    where msg.created_at > now() - make_interval(days => greatest(1, least(p_days, 90)))
    window w as (partition by msg.thread_id order by msg.id)
  )
  select jsonb_build_object(
    'days', greatest(1, least(p_days, 90)),
    'agents', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.asks desc) from (
        select agent_id,
               count(*) filter (where role = 'user')::int as asks,
               count(*) filter (where role = 'agent')::int as replies,
               count(*) filter (where role = 'system' and meta ? 'error')::int as errors,
               round(avg(extract(epoch from created_at - prev_at)) filter (where role = 'agent' and prev_role = 'user'))::int as avg_sec,
               coalesce(sum(length(content)) filter (where role = 'user'), 0)::int as in_chars,
               coalesce(sum(length(content)) filter (where role = 'agent'), 0)::int as out_chars,
               count(*) filter (where role = 'agent' and meta ->> 'engine' = 'grokbot')::int as grok_replies,
               count(*) filter (where role = 'user' and task_id is not null)::int as tasks
        from m group by agent_id) a), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.asks desc) from (
        select m.user_id, p.name, count(*) filter (where m.role = 'user' and m.task_id is null)::int as asks
        from m left join public.hc_profiles p on p.id = m.user_id
        group by m.user_id, p.name) x), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.day) from (
        select to_char(created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day,
               count(*) filter (where role = 'user')::int as asks,
               count(*) filter (where role = 'system' and meta ? 'error')::int as errors
        from m group by 1) d), '[]'::jsonb),
    'limits', coalesce((select value from public.hc_system_status where key = 'limits'), '{"daily_per_staff": 0}'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.hc_agent_stats(int) from public, anon;
grant execute on function public.hc_agent_stats(int) to authenticated;
