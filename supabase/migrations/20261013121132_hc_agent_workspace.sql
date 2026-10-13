-- Applied to General Table on 20261013121132
-- Ruang Kerja Agent: akses staff x agent, riwayat chat, hasil tugas lengkap, alamat n8n di Vault

-- 1) akses staff ke agent (owner otomatis akses penuh; staff baru kosong sampai diatur owner)
create table public.hc_agent_access (
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id text not null,
  level text not null default 'use' check (level in ('use', 'train')),
  granted_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (user_id, agent_id)
);
alter table public.hc_agent_access enable row level security;
revoke all on public.hc_agent_access from anon;
create policy hc_agent_access_select on public.hc_agent_access for select to authenticated
  using (user_id = (select auth.uid()) or (select public.hc_my_role()) = 'owner');
create policy hc_agent_access_owner_insert on public.hc_agent_access for insert to authenticated
  with check ((select public.hc_my_role()) = 'owner');
create policy hc_agent_access_owner_update on public.hc_agent_access for update to authenticated
  using ((select public.hc_my_role()) = 'owner') with check ((select public.hc_my_role()) = 'owner');
create policy hc_agent_access_owner_delete on public.hc_agent_access for delete to authenticated
  using ((select public.hc_my_role()) = 'owner');

-- tingkat akses saya ke agent: 'owner' | 'train' | 'use' | null
create or replace function public.hc_agent_level(p_agent text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when (select role from public.hc_profiles where id = auth.uid()) = 'owner' then 'owner'
    else (select level from public.hc_agent_access where user_id = auth.uid() and agent_id = p_agent)
  end;
$$;
revoke all on function public.hc_agent_level(text) from public, anon;
grant execute on function public.hc_agent_level(text) to authenticated;

-- 2) riwayat percakapan (privat per staff; owner bisa melihat semua). Pesan ditulis Edge Function.
create table public.hc_agent_threads (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Percakapan baru' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hc_agent_threads_user on public.hc_agent_threads (user_id, agent_id, updated_at desc);
alter table public.hc_agent_threads enable row level security;
revoke all on public.hc_agent_threads from anon;
create policy hc_agent_threads_select on public.hc_agent_threads for select to authenticated
  using (user_id = (select auth.uid()) or (select public.hc_my_role()) = 'owner');
create policy hc_agent_threads_delete on public.hc_agent_threads for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.hc_agent_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.hc_agent_threads (id) on delete cascade,
  role text not null check (role in ('user', 'agent', 'system')),
  content text not null check (char_length(content) between 1 and 20000),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index hc_agent_messages_thread on public.hc_agent_messages (thread_id, created_at);
alter table public.hc_agent_messages enable row level security;
revoke all on public.hc_agent_messages from anon;
create policy hc_agent_messages_select on public.hc_agent_messages for select to authenticated
  using (exists (select 1 from public.hc_agent_threads t where t.id = thread_id and (t.user_id = (select auth.uid()) or (select public.hc_my_role()) = 'owner')));
-- tidak ada policy insert: pesan hanya ditulis Edge Function agent-chat (service role)

-- 3) hasil lengkap tugas agent (log aktivitas hanya menyimpan 280 karakter)
alter table public.hc_plan_tasks add column if not exists result text;
alter table public.hc_plan_tasks add column if not exists result_at timestamptz;

-- 4) alamat n8n di satu tempat (Vault). Dibaca trigger & Edge Function lewat hive_n8n_url().
--    Kalau URL ngrok berubah: select vault.update_secret((select id from vault.secrets where name='hive_n8n_url'), '<url baru>');
create or replace function public.hive_n8n_url() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'hive_n8n_url' limit 1),
    'https://sliceable-mousiness-exorcist.ngrok-free.dev'
  );
$$;
revoke all on function public.hive_n8n_url() from public, anon, authenticated;
grant execute on function public.hive_n8n_url() to service_role;

create or replace function public.hc_approvals_notify_n8n() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    select decrypted_secret into s from vault.decrypted_secrets where name = 'hive_webhook_secret' limit 1;
    perform net.http_post(
      url := public.hive_n8n_url() || '/webhook/hive/approval-resume',
      body := jsonb_build_object('approval_id', new.id, 'status', new.status),
      headers := jsonb_build_object('Content-Type','application/json','ngrok-skip-browser-warning','1','x-hive-secret', coalesce(s,'')),
      timeout_milliseconds := 5000);
  end if;
  return new;
end $$;
revoke all on function public.hc_approvals_notify_n8n() from public, anon, authenticated;

select vault.create_secret('https://sliceable-mousiness-exorcist.ngrok-free.dev', 'hive_n8n_url', 'Alamat dasar n8n Hive Colony (ngrok)');

alter publication supabase_realtime add table public.hc_agent_messages;
