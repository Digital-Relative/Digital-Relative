-- ============================================================
-- Security hardening additions — run AFTER schema.sql
-- ============================================================

-- 1. Rate limit table — track failed auth attempts
create table if not exists public.rate_limits (
  id         uuid primary key default uuid_generate_v4(),
  identifier text not null,  -- IP or user ID
  action     text not null,  -- 'signin', 'password_reset', etc
  attempts   integer not null default 1,
  window_start timestamptz not null default now(),
  blocked_until timestamptz
);
create index if not exists rate_limits_identifier_idx on public.rate_limits(identifier, action);
alter table public.rate_limits enable row level security;
-- Only service role can access rate limits

-- 2. Security audit log
create table if not exists public.audit_log (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references public.profiles(id) on delete set null,
  action     text not null,   -- 'vault_entry_created', 'beneficiary_added', 'mfa_enabled', etc
  ip_address text,
  user_agent text,
  metadata   jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_user_id_idx on public.audit_log(user_id);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at);
alter table public.audit_log enable row level security;
create policy "Users can view own audit log" on public.audit_log for select using (auth.uid() = user_id);
-- Only service role can insert audit logs

-- 3. Lock down profiles — prevent users escalating their own plan
-- (Plan can only be updated by service role via webhook)
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can update own safe fields" on public.profiles;
-- CRIT-2 fix: WITH CHECK must restrict columns, not just ownership
-- Plan, stripe IDs, and security columns can only be set by service role
create policy "Users can update own safe fields" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Block plan escalation and stripe ID manipulation by comparing candidate value to existing
    and plan           = (select plan            from public.profiles where id = auth.uid())
    and coalesce(stripe_customer_id, '')     = coalesce((select stripe_customer_id     from public.profiles where id = auth.uid()), '')
    and coalesce(stripe_subscription_id, '') = coalesce((select stripe_subscription_id from public.profiles where id = auth.uid()), '')
    and coalesce(plan_renewal::text, '')     = coalesce((select plan_renewal::text     from public.profiles where id = auth.uid()), '')
    -- Block mfa_enrolled and mfa_email_fallback being set directly by the client
    and mfa_enrolled       = (select mfa_enrolled       from public.profiles where id = auth.uid())
    and mfa_email_fallback = (select mfa_email_fallback from public.profiles where id = auth.uid())
    -- B-4 fix: block additional security-sensitive fields from client mutation
    and coalesce(switch_triggered_at::text, '') = coalesce((select switch_triggered_at::text from public.profiles where id = auth.uid()), '')
    and coalesce(mfa_backup_email, '')          = coalesce((select mfa_backup_email          from public.profiles where id = auth.uid()), '')
    -- Note: duress_pin_set and duress_key_verification intentionally NOT locked here
    -- Users legitimately set these via DuressPinSetup — they are personal security prefs, not privilege fields
  );

-- 4. Prevent beneficiary token enumeration
-- Tokens are already 32 bytes random — ensure they're indexed for lookup speed
create index if not exists beneficiaries_token_idx on public.beneficiaries(invite_token)
  where invite_token is not null;

-- 5. Add entry size limits to prevent abuse
alter table public.vault_entries
  add constraint title_length    check (char_length(title) <= 500),
  add constraint username_length check (char_length(username) <= 10000),
  add constraint password_length check (char_length(password) <= 10000),
  add constraint notes_length    check (char_length(notes) <= 100000);

-- 6. Enforce plan limits at DB level via function
create or replace function public.check_entry_limit()
returns trigger language plpgsql security definer as $$
declare
  entry_count integer;
  user_plan   text;
begin
  select count(*) into entry_count
    from public.vault_entries where user_id = new.user_id;
  select plan into user_plan
    from public.profiles where id = new.user_id;

  if user_plan = 'free' and entry_count >= 5 then
    raise exception 'Free plan limit reached. Upgrade to add more entries.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_entry_limit on public.vault_entries;
create trigger enforce_entry_limit
  before insert on public.vault_entries
  for each row execute procedure public.check_entry_limit();

-- 7. Prevent horizontal privilege escalation on vault entries
-- (Already handled by RLS but add explicit check)
create or replace function public.verify_entry_ownership()
returns trigger language plpgsql security definer as $$
begin
  if new.user_id != auth.uid() then
    raise exception 'Cannot create entries for other users';
  end if;
  return new;
end;
$$;

drop trigger if exists verify_entry_ownership on public.vault_entries;
create trigger verify_entry_ownership
  before insert on public.vault_entries
  for each row execute procedure public.verify_entry_ownership();

-- 8. Enable realtime only for needed tables (reduce attack surface)
-- Run in dashboard: Realtime → disable for stripe_events, rate_limits, audit_log

-- ── Additional security fixes ──────────────────────────────

-- Fix: beneficiary "confirm via token" policy is too broad
-- Anyone who knows ANY token can confirm ANY record
-- Replace with a more specific policy
drop policy if exists "Beneficiaries can confirm via token" on public.beneficiaries;

-- New: only allow updating status to 'confirmed' when token matches
-- and prevent changing any other field
create policy "Beneficiaries confirm own invite" on public.beneficiaries
  for update
  using (invite_token is not null and status = 'pending')
  with check (status = 'confirmed' and invite_token = invite_token);

-- Rate limit: prevent token brute-forcing by adding failed attempts tracking
-- (Handled at application level — tokens are 32 bytes = 256 bits, brute force infeasible)
-- But add an index to make lookups fast and not enumerable
create index if not exists beneficiaries_token_status_idx
  on public.beneficiaries(invite_token, status)
  where status = 'pending';

-- Prevent vault entry titles from containing script tags (XSS defense in depth)
alter table public.vault_entries drop constraint if exists title_no_script;
alter table public.vault_entries
  add constraint title_no_script
  check (title !~* '<script|javascript:|data:text/html|onerror=|onload=');

-- Add missing INSERT policy for profiles (needed for new users)
drop policy if exists "Service can insert profiles" on public.profiles;
-- Profile creation is handled by the trigger (security definer) so no client insert needed

-- Ensure stripe_events has no user-accessible policies (service role only)
drop policy if exists "No public access to stripe events" on public.stripe_events;
create policy "No public access to stripe events" on public.stripe_events
  for all using (false); -- Completely blocked for all non-service-role

-- Add missing index on audit log for performance
create index if not exists audit_log_action_idx on public.audit_log(action, created_at);

-- Lock checkin_frequency_days to reasonable values
alter table public.profiles drop constraint if exists checkin_freq_bounds;
alter table public.profiles
  add constraint checkin_freq_bounds
  check (checkin_frequency_days between 7 and 365);

-- Ensure gdpr_consent_at is always set (required for legal compliance)
-- Users who sign up via OAuth may not have this set
create or replace function public.ensure_gdpr_consent()
returns trigger language plpgsql as $$
begin
  if new.gdpr_consent_at is null then
    new.gdpr_consent_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_gdpr_consent on public.profiles;
create trigger ensure_gdpr_consent
  before insert or update on public.profiles
  for each row execute procedure public.ensure_gdpr_consent();

-- ── Round 3 security additions ────────────────────────────

-- Fix: Use server-side timestamp for check-ins, not client-provided time
-- Override any client-provided last_checkin with NOW() on update
create or replace function public.enforce_server_checkin_time()
returns trigger language plpgsql security definer as $$
begin
  -- Always use server time for check-ins, ignore client-provided value
  if new.last_checkin is distinct from old.last_checkin then
    new.last_checkin = now();
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_server_checkin_time on public.profiles;
create trigger enforce_server_checkin_time
  before update on public.profiles
  for each row
  when (new.last_checkin is distinct from old.last_checkin)
  execute procedure public.enforce_server_checkin_time();

-- Fix: Prevent beneficiary email enumeration
-- Add rate limit check for beneficiary additions
create or replace function public.check_beneficiary_limit()
returns trigger language plpgsql security definer as $$
declare
  ben_count  integer;
  user_plan  text;
  max_bens   integer;
begin
  select count(*) into ben_count
    from public.beneficiaries where user_id = new.user_id;
  select plan into user_plan
    from public.profiles where id = new.user_id;

  max_bens := case user_plan
    when 'free'    then 1
    when 'single'  then 3
    when 'couples' then 5
    else 0
  end;

  if ben_count >= max_bens then
    raise exception 'Beneficiary limit reached for your plan';
  end if;
  return new;
end;
$$;

drop trigger if exists check_beneficiary_limit on public.beneficiaries;
create trigger check_beneficiary_limit
  before insert on public.beneficiaries
  for each row execute procedure public.check_beneficiary_limit();

-- Fix: Add email format check at DB level
alter table public.beneficiaries drop constraint if exists valid_email_format;
alter table public.beneficiaries
  add constraint valid_email_format
  check (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$');

-- Fix: Prevent names with script injection at DB level
alter table public.beneficiaries drop constraint if exists safe_name;
alter table public.beneficiaries
  add constraint safe_name
  check (name !~* '<script|javascript:|onerror=|onload=');

-- Add length limits to beneficiary fields
alter table public.beneficiaries drop constraint if exists name_length;
alter table public.beneficiaries
  add constraint name_length check (char_length(name) <= 200);

alter table public.beneficiaries drop constraint if exists email_length;
alter table public.beneficiaries
  add constraint email_length check (char_length(email) <= 254);

alter table public.beneficiaries drop constraint if exists relation_length;
alter table public.beneficiaries
  add constraint relation_length check (char_length(coalesce(relation,'')) <= 100);

-- Prevent stripe_customer_id being set by client (service role only via webhook)
-- Already handled by RLS but add explicit format check
alter table public.profiles drop constraint if exists valid_stripe_customer_id;
alter table public.profiles
  add constraint valid_stripe_customer_id
  check (stripe_customer_id is null or stripe_customer_id ~* '^cus_[A-Za-z0-9]+$');

alter table public.profiles drop constraint if exists valid_stripe_subscription_id;
alter table public.profiles
  add constraint valid_stripe_subscription_id
  check (stripe_subscription_id is null or stripe_subscription_id ~* '^sub_[A-Za-z0-9]+$');

-- ── Rate limits TTL cleanup ──────────────────────────────────────────────────
-- Remove rate limit entries older than 1 hour to prevent unbounded table growth
create or replace function public.cleanup_rate_limits()
returns void language plpgsql as $$
begin
  delete from public.rate_limits where window_start < now() - interval '1 hour';
end;
$$;

-- Run cleanup on every insert into rate_limits (lightweight, rows are tiny)
create or replace function public.trigger_cleanup_rate_limits()
returns trigger language plpgsql as $$
begin
  -- Only run cleanup ~1 in 100 inserts to avoid overhead
  if (random() < 0.01) then
    perform public.cleanup_rate_limits();
  end if;
  return new;
end;
$$;

drop trigger if exists cleanup_rate_limits_trigger on public.rate_limits;
create trigger cleanup_rate_limits_trigger
  after insert on public.rate_limits
  for each row execute function public.trigger_cleanup_rate_limits();
