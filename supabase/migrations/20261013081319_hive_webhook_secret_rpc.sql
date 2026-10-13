-- Applied to General Table on 20261013081319
create or replace function public.hive_webhook_secret() returns text language sql security definer set search_path = '' as $$ select decrypted_secret from vault.decrypted_secrets where name = 'hive_webhook_secret' limit 1 $$;
revoke all on function public.hive_webhook_secret() from public, anon, authenticated;
grant execute on function public.hive_webhook_secret() to service_role;
