-- Tahap 3 Ruang Kerja Agent: hasil tersimpan, lampiran file, dan approval yang kembali ke percakapan.

-- 1) Hasil tersimpan: jawaban agent yang disimpan staff (panel "Hasil" di Ruang Kerja)
create table public.hc_agent_results (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_id bigint references public.hc_agent_messages (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);
create index hc_agent_results_agent_idx on public.hc_agent_results (agent_id, created_at desc);
alter table public.hc_agent_results enable row level security;
create policy hc_agent_results_select on public.hc_agent_results for select to authenticated
  using (user_id = (select auth.uid()) or (select public.hc_my_role()) = 'owner');
create policy hc_agent_results_insert on public.hc_agent_results for insert to authenticated
  with check (user_id = (select auth.uid()) and public.hc_agent_level(agent_id) is not null);
create policy hc_agent_results_delete on public.hc_agent_results for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.hc_my_role()) = 'owner');

-- 2) Lampiran: bucket privat, file disimpan di folder <user_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hc-agent-files', 'hc-agent-files', false, 10485760,
  array['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv','text/markdown','application/json'])
on conflict (id) do nothing;
create policy hc_agent_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hc-agent-files' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.hc_my_role()) is not null);
create policy hc_agent_files_select on storage.objects for select to authenticated
  using (bucket_id = 'hc-agent-files' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.hc_my_role()) = 'owner'));
create policy hc_agent_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hc-agent-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3) Approval: trigger memanggil Edge Function agent-chat (bukan n8n langsung). agent-chat meneruskan
--    ke n8n approval-resume, lalu menaruh jawaban agent ke percakapan asal & hasil tugas papan rencana.
create index if not exists hc_agent_messages_approval_idx on public.hc_agent_messages ((meta ->> 'approval_id')) where meta ? 'approval_id';

create or replace function public.hc_approvals_notify_n8n()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare s text;
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    select decrypted_secret into s from vault.decrypted_secrets where name = 'hive_webhook_secret' limit 1;
    perform net.http_post(
      url := 'https://ccbyqgisgclqlqatxwbk.supabase.co/functions/v1/agent-chat',
      body := jsonb_build_object('action', 'resume', 'approval_id', new.id, 'status', new.status),
      headers := jsonb_build_object('Content-Type','application/json','x-hive-secret', coalesce(s,'')),
      timeout_milliseconds := 5000);
  end if;
  return new;
end $$;
