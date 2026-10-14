-- Portal saya (#/saya): penanggung jawab & pembuat tugas papan rencana, to-do pribadi,
-- dan penanda video perkenalan untuk staff baru (wajib ditonton sekali).

-- ---------- tugas papan rencana: penanggung jawab (akun) & pembuat ----------
alter table public.hc_plan_tasks add column if not exists assignee uuid references auth.users (id) on delete set null;
alter table public.hc_plan_tasks add column if not exists created_by uuid references auth.users (id) on delete set null;
create index if not exists hc_plan_tasks_assignee_idx on public.hc_plan_tasks (assignee) where assignee is not null;
create index if not exists hc_plan_tasks_created_by_idx on public.hc_plan_tasks (created_by) where created_by is not null;

-- tugas manusia lama: cocokkan penanggung jawab lewat nama; tugas agent lama: pembuat = pengubah terakhir
update public.hc_plan_tasks t set assignee = p.id
  from public.hc_profiles p
  where t.kind = 'human' and t.assignee is null and lower(trim(t.who)) = lower(trim(p.name));
update public.hc_plan_tasks set created_by = updated_by where created_by is null and updated_by is not null;

-- tugas manusia baru tanpa assignee: cocokkan nama; pembuat diisi dari login kalau kosong
create or replace function public.hc_plan_tasks_people()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' and new.created_by is null then
    new.created_by := auth.uid();
  end if;
  if new.kind = 'human' and (new.assignee is null or (tg_op = 'UPDATE' and new.who is distinct from old.who and new.assignee is not distinct from old.assignee)) then
    select p.id into new.assignee from public.hc_profiles p where lower(trim(p.name)) = lower(trim(new.who)) limit 1;
  end if;
  return new;
end $$;
drop trigger if exists hc_plan_tasks_people on public.hc_plan_tasks;
create trigger hc_plan_tasks_people before insert or update on public.hc_plan_tasks
  for each row execute function public.hc_plan_tasks_people();

-- ---------- to-do pribadi (hanya pemiliknya yang bisa melihat & mengubah) ----------
create table if not exists public.hc_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  col text not null default 'todo' check (col in ('todo', 'doing', 'done')),
  sort int not null default 0,
  source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hc_todos_user_idx on public.hc_todos (user_id, col, sort);
alter table public.hc_todos enable row level security;
drop policy if exists hc_todos_select on public.hc_todos;
drop policy if exists hc_todos_insert on public.hc_todos;
drop policy if exists hc_todos_update on public.hc_todos;
drop policy if exists hc_todos_delete on public.hc_todos;
create policy hc_todos_select on public.hc_todos for select to authenticated using (user_id = (select auth.uid()));
create policy hc_todos_insert on public.hc_todos for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.hc_my_role()) is not null);
create policy hc_todos_update on public.hc_todos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy hc_todos_delete on public.hc_todos for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.hc_todos_touch()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists hc_todos_touch on public.hc_todos;
create trigger hc_todos_touch before update on public.hc_todos for each row execute function public.hc_todos_touch();

-- ---------- video perkenalan wajib untuk staff baru ----------
alter table public.hc_profiles add column if not exists intro_seen_at timestamptz;
-- akun yang sudah ada tidak dipaksa menonton; hanya staff yang mendaftar setelah ini
update public.hc_profiles set intro_seen_at = now() where intro_seen_at is null;

create or replace function public.hc_mark_intro_seen()
returns timestamptz
language sql
security definer
set search_path to ''
as $$
  update public.hc_profiles set intro_seen_at = coalesce(intro_seen_at, now())
  where id = auth.uid()
  returning intro_seen_at;
$$;
revoke all on function public.hc_mark_intro_seen() from public, anon;
grant execute on function public.hc_mark_intro_seen() to authenticated;
