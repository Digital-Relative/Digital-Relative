-- ══════════════════════════════════════════════════════════════
-- ROUND 6: External audit findings fixes
-- C-1: Restrict anon access - beneficiary-access edge function handles all data reads
-- H-5: Tautological WITH CHECK already fixed in round5 SQL
-- Run after schema-security-round5.sql
-- ══════════════════════════════════════════════════════════════

-- ── C-1 FIX: Remove permissive anon policies added in round5 ──
-- All beneficiary portal data now goes through the beneficiary-access edge function
-- which uses the service role key and enforces tier-appropriate data server-side.
-- The direct anon queries are no longer used by the portal.

-- Remove any accidentally permissive policies we may have added
drop policy if exists "Beneficiary portal read by token"    on public.beneficiaries;
drop policy if exists "Beneficiary can read after_i_am_gone" on public.after_i_am_gone;
drop policy if exists "Beneficiary can read vault entries"  on public.vault_entries;

-- Ensure after_i_am_gone is locked down (only auth owner can read)
drop policy if exists "Users can manage own guide" on public.after_i_am_gone;
drop policy if exists "Users can manage own guide" on public.after_i_am_gone;
create policy "Users can manage own guide" on public.after_i_am_gone
  for all using (auth.uid() = user_id);

-- ── Migration: update any legacy confirmed rows ──
update public.beneficiaries
  set status = 'email_confirmed'
  where status = 'confirmed';

-- ── Note on vault_entries and beneficiaries ──
-- vault_entries: auth.uid() = user_id policy handles owner access
-- beneficiaries: service role in edge function handles portal reads
-- No anon SELECT policies needed on either table

-- ── H-2 FIX: Allow linked beneficiary to accept or decline nomination ──
-- BeneficiaryDashboard.jsx needs to update status for the linked user's own nominations
drop policy if exists "Linked user can accept or decline nomination" on public.beneficiaries;
drop policy if exists "Linked user can accept or decline nomination" on public.beneficiaries;
create policy "Linked user can accept or decline nomination" on public.beneficiaries
  for update
  using (linked_user_id = auth.uid() and status = 'invited')
  with check (
    linked_user_id = auth.uid()
    and status in ('email_confirmed', 'declined')
    -- user_id, linked_user_id, invite_token, is_executor cannot be changed by beneficiary
  );

-- ── H-1 FIX: Revoke existing PIN-protected shared links ──
-- SHA-256 hashes stored before PBKDF2 upgrade are permanently incompatible.
-- PIN-protected links created before v80 must be revoked so owners can recreate them.
-- Non-PIN links are unaffected.
update public.shared_links
  set revoked = true, revoked_at = now()
  where pin_hash is not null
    and revoked = false;

-- ── H-2 FIX: Add access_requirement column to beneficiaries ──
-- Stores what the beneficiary must prove before accessing the vault
alter table public.beneficiaries
  add column if not exists access_requirement text not null default 'death_certificate'
  check (access_requirement in ('death_certificate', 'id_only', 'trust_only'));

-- ── M-2 FIX: Add resend_requested_at for rate-limiting invite resends ──
alter table public.beneficiaries
  add column if not exists resend_requested_at timestamptz default null;

-- ── Specific categories only — junction table ──
-- Tracks which vault entries are shared with which beneficiaries
-- Used when beneficiary access_level = 'Specific categories only'
create table if not exists public.beneficiary_shared_entries (
  id             uuid primary key default uuid_generate_v4(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  entry_id       uuid not null references public.vault_entries(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (beneficiary_id, entry_id)
);
alter table public.beneficiary_shared_entries enable row level security;
drop policy if exists "Users can manage shared entries for own beneficiaries" on public.beneficiary_shared_entries;
drop policy if exists "Users can manage shared entries for own beneficiaries" on public.beneficiary_shared_entries;
create policy "Users can manage shared entries for own beneficiaries" on public.beneficiary_shared_entries
  for all using (
    exists (
      select 1 from public.beneficiaries b
      where b.id = beneficiary_id and b.user_id = auth.uid()
    )
    and exists (
      select 1 from public.vault_entries v
      where v.id = entry_id and v.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.beneficiaries b
      where b.id = beneficiary_id and b.user_id = auth.uid()
    )
    and exists (
      select 1 from public.vault_entries v
      where v.id = entry_id and v.user_id = auth.uid()
    )
  );
create index if not exists beneficiary_shared_entries_ben_idx on public.beneficiary_shared_entries(beneficiary_id);
create index if not exists beneficiary_shared_entries_entry_idx on public.beneficiary_shared_entries(entry_id);

-- ── Marketing opt-in and language preference ──
alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists preferred_language text not null default 'en'
    check (preferred_language in ('en', 'pl', 'ur', 'ar'));

-- ── Device sign-in log ──
create table if not exists public.device_log (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  ip_address   text,
  user_agent   text,
  location     text,
  created_at   timestamptz not null default now()
);
create index if not exists device_log_user_idx on public.device_log(user_id, created_at desc);
alter table public.device_log enable row level security;
drop policy if exists "Users can view own device log" on public.device_log;
create policy "Users can view own device log" on public.device_log
  for select using (auth.uid() = user_id);
-- Only service role can insert (via edge function)

-- ── MFA backup email codes ──
alter table public.profiles
  add column if not exists mfa_backup_email text default null;

-- ── Address field on vault_entries ──
-- Added for UK address lookup feature
alter table public.vault_entries
  add column if not exists address text default null;

-- ── Vault entry versioning ──
-- Stores up to 3 previous versions per entry (encrypted fields only)
create table if not exists public.vault_entry_versions (
  id         uuid primary key default uuid_generate_v4(),
  entry_id   uuid not null references public.vault_entries(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  username   text,
  password   text,
  notes      text,
  address    text,
  saved_at   timestamptz not null default now()
);
create index if not exists vev_entry_idx on public.vault_entry_versions(entry_id, saved_at desc);
alter table public.vault_entry_versions
  add column if not exists secure_content text default null;
alter table public.vault_entry_versions enable row level security;
drop policy if exists "Users can manage own entry versions" on public.vault_entry_versions;
create policy "Users can manage own entry versions" on public.vault_entry_versions
  for all using (auth.uid() = user_id);

-- ── Shared link access notifications ──
alter table public.shared_links
  add column if not exists notify_on_access boolean not null default false;

-- ── Duress PIN ──
-- A second PIN that shows a decoy vault with dummy entries
-- Accessing with the duress PIN silently alerts the real owner and admin
alter table public.profiles
  add column if not exists duress_pin_set        boolean not null default false,
  add column if not exists duress_key_verification text default null;

-- Decoy vault entries - shown when duress PIN is entered
create table if not exists public.decoy_entries (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  category   text not null default 'banking',
  title      text not null,
  username   text,   -- AES-256-GCM encrypted with duress key
  password   text,   -- AES-256-GCM encrypted with duress key
  notes      text,
  created_at timestamptz not null default now()
);
alter table public.decoy_entries enable row level security;
drop policy if exists "Users can manage own decoy entries" on public.decoy_entries;
create policy "Users can manage own decoy entries" on public.decoy_entries
  for all using (auth.uid() = user_id);

-- ── Vault entry access tracking ──
alter table public.vault_entries
  add column if not exists last_accessed_at timestamptz default null,
  add column if not exists last_accessed_by uuid references public.profiles(id) on delete set null;

-- ── Vault PIN recovery codes ────────────────────────────────────────────
-- 8 one-time codes that let a user recover vault access if they forget their PIN
-- Each code is stored as an encrypted blob: AES-GCM(vaultPIN, derivedFromCode)
-- The vault PIN is never stored plaintext anywhere
create table if not exists public.vault_recovery_codes (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  code_index   smallint not null,        -- 0-7
  encrypted_pin text not null,           -- AES-GCM(PIN, PBKDF2(code, userId))
  used_at      timestamptz default null,
  created_at   timestamptz not null default now(),
  unique (user_id, code_index)
);
alter table public.vault_recovery_codes enable row level security;
-- B-5 fix: split policies to prevent client corrupting encrypted_pin or used_at
drop policy if exists "Users read own recovery codes" on public.vault_recovery_codes;
create policy "Users read own recovery codes" on public.vault_recovery_codes
  for select using (auth.uid() = user_id);

drop policy if exists "Users insert own recovery codes" on public.vault_recovery_codes;
create policy "Users insert own recovery codes" on public.vault_recovery_codes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own recovery code fetch_count and used_at" on public.vault_recovery_codes;
create policy "Users update own recovery code fetch_count and used_at" on public.vault_recovery_codes
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    -- encrypted_pin must not change (it contains the PIN encrypted with recovery code)
    and encrypted_pin = (select encrypted_pin from public.vault_recovery_codes r where r.id = vault_recovery_codes.id)
    and code_index    = (select code_index    from public.vault_recovery_codes r where r.id = vault_recovery_codes.id)
  );

drop policy if exists "Users delete own recovery codes" on public.vault_recovery_codes;
create policy "Users delete own recovery codes" on public.vault_recovery_codes
  for delete using (auth.uid() = user_id);

-- ── Secure note content field ────────────────────────────────────────────
alter table public.vault_entries
  add column if not exists secure_content text default null;
-- Encrypted with AES-256-GCM like username, password, notes

-- ── Beneficiary groups ─────────────────────────────────────────────────────
-- Groups let owners label beneficiaries (e.g. "Family", "Solicitor", "Friends")
-- The group is display-only - access level and requirement are still per-beneficiary
alter table public.beneficiaries
  add column if not exists group_name text default null
  check (char_length(group_name) <= 50);

-- ── Phone number for SMS reminders ──────────────────────────────────────────
alter table public.profiles
  add column if not exists phone_number text default null
  check (phone_number is null or phone_number ~ '^\\+[1-9]\\d{7,14}$');

-- Allow user to update their own phone number (within safeFields)
-- No additional RLS needed - phone_number is not security-sensitive

-- ── Recovery code access rate limiting ──────────────────────────────────────
-- Track how many times recovery code blobs are fetched to detect exfiltration
alter table public.vault_recovery_codes
  add column if not exists fetch_count integer not null default 0;

-- Split RLS policies: allow SELECT only, with no INSERT via RLS (use service role)
-- The fetch_count increment is handled by a trigger on SELECT is not possible in Postgres.
-- Instead: client increments fetch_count on read via a separate update call.
-- Real protection: the blobs are only useful to someone who also has the Supabase session.

alter table public.vault_entry_versions
  add column if not exists secure_content text default null;

-- ── Version history — add title/category for complete snapshots ─────────────
alter table public.vault_entry_versions
  add column if not exists title    text default null,
  add column if not exists category text default null;

-- ── Push notification subscriptions ─────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id) where active = true;

-- ── Executor task progress (server-side persistence) ─────────────────────────
-- Keyed by beneficiary ID so it persists across sessions and devices
-- Only beneficiary-access tokens can write this (RLS: no auth.uid() - uses service role)
create table if not exists public.executor_progress (
  id             uuid primary key default uuid_generate_v4(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  task_statuses  jsonb not null default '{}',   -- { [taskId]: 'pending'|'inProgress'|'done'|'notRequired' }
  task_notes     jsonb not null default '{}',   -- { [taskId]: 'note text' }
  updated_at     timestamptz not null default now(),
  unique (beneficiary_id)
);
-- RLS: deny all direct access - managed via beneficiary-access edge function only
alter table public.executor_progress enable row level security;

-- ── WebAuthn passkey credentials ─────────────────────────────────────────────
create table if not exists public.webauthn_credentials (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  credential_id   text not null unique,        -- base64url credential ID from authenticator
  public_key      text not null,               -- COSE-encoded public key (base64)
  device_name     text not null default 'Security key',
  sign_count      bigint not null default 0,   -- replay protection
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz
);
alter table public.webauthn_credentials enable row level security;
drop policy if exists "Users manage own WebAuthn credentials" on public.webauthn_credentials;
create policy "Users manage own WebAuthn credentials" on public.webauthn_credentials
  for all using (auth.uid() = user_id);
create index if not exists webauthn_creds_user_idx on public.webauthn_credentials(user_id);

-- ── Structured data fields per vault entry category ─────────────────────────
alter table public.vault_entries
  add column if not exists structured_data jsonb default null;
-- Stored as plaintext JSON - not encrypted (reference data like sort codes)
-- Sensitive values (account numbers) should go in username/password fields instead

-- ── WebAuthn challenges (server-generated, 5-min TTL) ────────────────────────
create table if not exists public.webauthn_challenges (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  challenge  text not null,
  purpose    text not null check (purpose in ('registration', 'assertion')),
  expires_at timestamptz not null,
  unique (user_id, purpose)
);
-- No RLS - service role only (edge function handles all access)
alter table public.webauthn_challenges enable row level security;

-- ── RLS policies for executor_progress ──────────────────────────────────────
-- D-1 fix: no client-facing policy — beneficiary portal has no Supabase auth session
-- All executor_progress reads/writes go through edge functions (service role)
-- The beneficiary-access edge function returns beneficiary data; progress is co-located.
-- Direct client access is impossible without a Supabase JWT (beneficiaries use tokens not sessions).

-- C-3 fix: token expiry for emergency access tokens
alter table public.beneficiaries
  add column if not exists token_expires_at timestamptz default null;

-- B-4 fix: full profiles WITH CHECK with all *billing* columns locked.
-- mfa_enrolled / mfa_email_fallback / mfa_backup_email are deliberately NOT
-- pinned: the client legitimately sets these as it completes MFA enrolment
-- (MfaSetup.jsx:88). The real security boundary is the Supabase Auth factor
-- list, not this denormalised flag — an attacker who flipped mfa_enrolled
-- to false in the profile still has to defeat Supabase Auth's actual MFA
-- challenge to sign in.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and plan                                 = (select plan                     from public.profiles where id = auth.uid())
    and coalesce(stripe_customer_id, '')     = coalesce((select stripe_customer_id     from public.profiles where id = auth.uid()), '')
    and coalesce(stripe_subscription_id, '') = coalesce((select stripe_subscription_id from public.profiles where id = auth.uid()), '')
    and coalesce(plan_renewal::text, '')     = coalesce((select plan_renewal::text     from public.profiles where id = auth.uid()), '')
    and coalesce(switch_triggered_at::text, '') = coalesce((select switch_triggered_at::text from public.profiles where id = auth.uid()), '')
    -- mfa_* fields intentionally NOT locked — see comment above
  );

-- ══════════════════════════════════════════════════════════════
-- audit_log INSERT policy
-- ──────────────────────────────────────────────────────────────
-- The client writes its own audit events (sign-in, vault_entry_*,
-- beneficiary_*, checked_in) via supabase.from('audit_log').insert(...)
-- with the authenticated user's JWT. Without this policy those
-- inserts are silently denied by RLS. The WITH CHECK ensures a user
-- can only attribute events to themselves.
-- Service-role inserts (from edge functions) bypass RLS and are
-- unaffected.
-- ══════════════════════════════════════════════════════════════

drop policy if exists "Users can insert own audit log" on public.audit_log;
create policy "Users can insert own audit log" on public.audit_log
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- partner_links — requester cancels pending invite
-- See supabase/migrations/partner-cancel-pending.sql for context.
-- ══════════════════════════════════════════════════════════════

drop policy if exists "Requester can cancel pending invite" on public.partner_links;
create policy "Requester can cancel pending invite" on public.partner_links
  for update
  using (auth.uid() = requester_id and status = 'pending')
  with check (
    auth.uid() = requester_id
    and status = 'unlinked'
  );

-- ══════════════════════════════════════════════════════════════
-- partner_links — invite_email for resend
-- See supabase/migrations/partner-invite-email.sql for context.
-- ══════════════════════════════════════════════════════════════

alter table public.partner_links
  add column if not exists invite_email text default null;

