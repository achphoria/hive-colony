-- Gambar/file dari Grok Bot: pesan bot yang membawa files berupa URL ikut dikirim ke agent-chat (grok_reply)
-- supaya file disalin ke bucket hc-agent-files dan tampil di Ruang Kerja.
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
     and not jsonb_path_exists(coalesce(new.meta, '{}'::jsonb), '$.files[*] ? (exists(@.url) && !exists(@.path))')
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
