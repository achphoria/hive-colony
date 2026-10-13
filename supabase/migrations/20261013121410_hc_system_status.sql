-- Applied to General Table (hc_system_status)
-- Cache status sistem (mis. kesehatan n8n) supaya pengecekan ke PC kantor tidak berlebihan.
-- Hanya diakses Edge Function (service role): RLS aktif tanpa policy.
create table public.hc_system_status (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
alter table public.hc_system_status enable row level security;
revoke all on public.hc_system_status from anon, authenticated;
