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
create policy "Users can view own device log" on public.device_log
  for select using (auth.uid() = user_id);
-- Only service role can insert (via edge function)

-- ── MFA backup email codes ──
alter table public.profiles
  add column if not exists mfa_backup_email text default null;
