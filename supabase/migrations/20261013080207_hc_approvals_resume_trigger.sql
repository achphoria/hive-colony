-- Applied to General Table on 20261013080207
create or replace function public.hc_approvals_notify_n8n() returns trigger language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    select decrypted_secret into s from vault.decrypted_secrets where name = 'hive_webhook_secret' limit 1;
    perform net.http_post(
      url := 'https://sliceable-mousiness-exorcist.ngrok-free.dev/webhook/hive/approval-resume',
      body := jsonb_build_object('approval_id', new.id, 'status', new.status),
      headers := jsonb_build_object('Content-Type','application/json','ngrok-skip-browser-warning','1','x-hive-secret', coalesce(s,'')),
      timeout_milliseconds := 5000);
  end if;
  return new;
end $$;
revoke all on function public.hc_approvals_notify_n8n() from public, anon, authenticated;
create trigger hc_approvals_resume after update of status on public.hc_approvals for each row execute function public.hc_approvals_notify_n8n();
