-- ZCS Connect · the deliver Edge Function verifies its trigger secret against
-- Vault (deliver_secret), so the secret is configured in exactly one place.
create or replace function public.worker_check_secret(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'deliver_secret' and decrypted_secret = p_secret)
$$;
revoke execute on function public.worker_check_secret(text) from public, anon, authenticated;
grant execute on function public.worker_check_secret(text) to service_role;
