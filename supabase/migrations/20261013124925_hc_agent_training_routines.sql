-- Tahap 4: latih agent (penilaian 👍/👎 + koreksi, kartu skill, pelajaran, persona, skor skill)
-- Tahap 5: tugas rutin terjadwal per agent (dijalankan workflow n8n "Hive - Routine Tick" lewat agent-chat)

-- ---------- persona dasar + prompt hasil rakitan ----------
-- n8n tetap membaca hc_agent_prompts.system_prompt. Kolom itu sekarang dirakit otomatis dari
-- persona + skill + pelajaran. Ubah persona lewat Ruang Kerja (atau kolom persona), bukan system_prompt.
alter table public.hc_agent_prompts add column if not exists persona text;
update public.hc_agent_prompts set persona = system_prompt where persona is null;

create table public.hc_agent_skills (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  kind text not null default 'skill' check (kind in ('skill', 'lesson')),
  name text not null check (char_length(name) between 1 and 80),
  instruction text not null check (char_length(instruction) between 1 and 1500),
  active boolean not null default true,
  source_feedback uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hc_agent_skills_agent_idx on public.hc_agent_skills (agent_id, created_at);
alter table public.hc_agent_skills enable row level security;
create policy hc_agent_skills_select on public.hc_agent_skills for select to authenticated
  using (public.hc_agent_level(agent_id) is not null);
create policy hc_agent_skills_insert on public.hc_agent_skills for insert to authenticated
  with check (public.hc_agent_level(agent_id) in ('owner', 'train'));
create policy hc_agent_skills_update on public.hc_agent_skills for update to authenticated
  using (public.hc_agent_level(agent_id) in ('owner', 'train'))
  with check (public.hc_agent_level(agent_id) in ('owner', 'train'));
create policy hc_agent_skills_delete on public.hc_agent_skills for delete to authenticated
  using (public.hc_agent_level(agent_id) in ('owner', 'train'));

-- rakit ulang system_prompt agent dari persona + skill aktif + pelajaran aktif
create or replace function public.hc_agent_compile(p_agent text)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.hc_agent_prompts p
  set system_prompt = coalesce(p.persona, p.system_prompt)
      || coalesce((select E'\n\nSKILL & ATURAN KERJA (dilatih staff Hive Colony, ikuti saat relevan):\n'
                          || string_agg('- ' || s.name || ': ' || s.instruction, E'\n' order by s.created_at)
                   from public.hc_agent_skills s where s.agent_id = p_agent and s.active and s.kind = 'skill'), '')
      || coalesce((select E'\n\nPELAJARAN DARI KOREKSI STAFF (jangan ulangi kesalahan ini):\n'
                          || string_agg('- ' || s.instruction, E'\n' order by s.created_at)
                   from public.hc_agent_skills s where s.agent_id = p_agent and s.active and s.kind = 'lesson'), ''),
      updated_at = now()
  where p.agent_id = p_agent;
$$;
revoke all on function public.hc_agent_compile(text) from public, anon, authenticated;

create or replace function public.hc_agent_skills_changed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return coalesce(new, old);
end $$;
create trigger hc_agent_skills_touch before update on public.hc_agent_skills
  for each row execute function public.hc_agent_skills_changed();

create or replace function public.hc_agent_skills_recompile()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.hc_agent_compile(coalesce(new.agent_id, old.agent_id));
  if tg_op = 'UPDATE' and new.agent_id is distinct from old.agent_id then perform public.hc_agent_compile(old.agent_id); end if;
  return null;
end $$;
create trigger hc_agent_skills_compile after insert or update or delete on public.hc_agent_skills
  for each row execute function public.hc_agent_skills_recompile();

-- ubah persona dasar (owner & Pelatih agent itu)
create or replace function public.hc_agent_set_persona(p_agent text, p_persona text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce(public.hc_agent_level(p_agent), '') not in ('owner', 'train') then
    raise exception 'no_access' using errcode = '42501';
  end if;
  if char_length(coalesce(p_persona, '')) not between 50 and 12000 then
    raise exception 'persona_length' using errcode = '22023';
  end if;
  update public.hc_agent_prompts set persona = p_persona where agent_id = p_agent;
  perform public.hc_agent_compile(p_agent);
end $$;
revoke all on function public.hc_agent_set_persona(text, text) from public, anon;
grant execute on function public.hc_agent_set_persona(text, text) to authenticated;

-- ---------- penilaian jawaban agent ----------
create table public.hc_agent_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id bigint not null references public.hc_agent_messages (id) on delete cascade,
  agent_id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  note text check (note is null or char_length(note) <= 1000),
  ask_excerpt text,
  reply_excerpt text,
  status text not null default 'open' check (status in ('open', 'learned', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);
create index hc_agent_feedback_agent_idx on public.hc_agent_feedback (agent_id, created_at desc);
alter table public.hc_agent_feedback enable row level security;
create policy hc_agent_feedback_select on public.hc_agent_feedback for select to authenticated
  using (user_id = (select auth.uid()) or public.hc_agent_level(agent_id) in ('owner', 'train'));
create policy hc_agent_feedback_insert on public.hc_agent_feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.hc_agent_level(agent_id) is not null
    and exists (
      select 1 from public.hc_agent_messages m join public.hc_agent_threads t on t.id = m.thread_id
      where m.id = message_id and m.role = 'agent' and t.agent_id = hc_agent_feedback.agent_id
    )
  );
create policy hc_agent_feedback_update on public.hc_agent_feedback for update to authenticated
  using (user_id = (select auth.uid()) or public.hc_agent_level(agent_id) in ('owner', 'train'))
  with check (user_id = (select auth.uid()) or public.hc_agent_level(agent_id) in ('owner', 'train'));
create policy hc_agent_feedback_delete on public.hc_agent_feedback for delete to authenticated
  using (user_id = (select auth.uid()));

-- cuplikan pertanyaan & jawaban diisi server (Pelatih bisa membaca konteks tanpa akses ke percakapan staff)
create or replace function public.hc_agent_feedback_fill()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' or new.message_id is distinct from old.message_id then
    select left(m.content, 2000) into new.reply_excerpt from public.hc_agent_messages m where m.id = new.message_id;
    select left(u.content, 1000) into new.ask_excerpt
      from public.hc_agent_messages u
      where u.thread_id = (select thread_id from public.hc_agent_messages where id = new.message_id)
        and u.role = 'user' and u.id < new.message_id
      order by u.id desc limit 1;
  end if;
  return new;
end $$;
create trigger hc_agent_feedback_fill before insert or update on public.hc_agent_feedback
  for each row execute function public.hc_agent_feedback_fill();

-- skor skill nyata: 30 hari terakhir, (👍+1)/(total+2) supaya agent baru mulai dari 50
create or replace function public.hc_agent_scores()
returns table (agent_id text, up int, down int, score int)
language sql
stable
security definer
set search_path to ''
as $$
  select f.agent_id,
         (count(*) filter (where f.rating = 1))::int,
         (count(*) filter (where f.rating = -1))::int,
         round(100.0 * ((count(*) filter (where f.rating = 1)) + 1) / (count(*) + 2))::int
  from public.hc_agent_feedback f
  where f.created_at > now() - interval '30 days' and public.hc_my_role() is not null
  group by f.agent_id;
$$;
revoke all on function public.hc_agent_scores() from public, anon;
grant execute on function public.hc_agent_scores() to authenticated;

-- ---------- tugas rutin ----------
create table public.hc_agent_routines (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  title text not null check (char_length(title) between 1 and 120),
  instruction text not null check (char_length(instruction) between 1 and 3000),
  kind text not null check (kind in ('daily', 'weekdays', 'weekly', 'monthly')),
  dow int check (dow between 1 and 7),
  dom int check (dom between 1 and 31),
  at_time time not null default '08:00',
  active boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_task_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'weekly' or dow is not null),
  check (kind <> 'monthly' or dom is not null)
);
create index hc_agent_routines_due_idx on public.hc_agent_routines (next_run_at) where active;
alter table public.hc_agent_routines enable row level security;
create policy hc_agent_routines_select on public.hc_agent_routines for select to authenticated
  using (public.hc_agent_level(agent_id) is not null);
create policy hc_agent_routines_insert on public.hc_agent_routines for insert to authenticated
  with check (public.hc_agent_level(agent_id) in ('owner', 'train'));
create policy hc_agent_routines_update on public.hc_agent_routines for update to authenticated
  using (public.hc_agent_level(agent_id) in ('owner', 'train'))
  with check (public.hc_agent_level(agent_id) in ('owner', 'train'));
create policy hc_agent_routines_delete on public.hc_agent_routines for delete to authenticated
  using (public.hc_agent_level(agent_id) in ('owner', 'train'));

-- jadwal berikutnya (WIB) setelah p_from
create or replace function public.hc_routine_next(p_kind text, p_dow int, p_dom int, p_at time, p_from timestamptz)
returns timestamptz
language plpgsql
stable
set search_path to ''
as $$
declare
  loc timestamp := p_from at time zone 'Asia/Jakarta';
  d date;
  i int;
  last_day int;
begin
  for i in 0..62 loop
    d := loc::date + i;
    if d + p_at <= loc then continue; end if;
    last_day := extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int;
    if p_kind = 'daily'
       or (p_kind = 'weekdays' and extract(isodow from d) between 1 and 5)
       or (p_kind = 'weekly' and extract(isodow from d) = p_dow)
       or (p_kind = 'monthly' and extract(day from d) = least(p_dom, last_day)) then
      return (d + p_at) at time zone 'Asia/Jakarta';
    end if;
  end loop;
  return null;
end $$;

create or replace function public.hc_agent_routines_schedule()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at := now();
  new.next_run_at := case when new.active then public.hc_routine_next(new.kind, new.dow, new.dom, new.at_time, now()) end;
  return new;
end $$;
create trigger hc_agent_routines_schedule before insert or update on public.hc_agent_routines
  for each row execute function public.hc_agent_routines_schedule();
