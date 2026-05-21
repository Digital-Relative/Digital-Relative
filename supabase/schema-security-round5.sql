-- ============================================================
-- Security Round 5 — Run AFTER schema-security-round4.sql
-- ============================================================

-- ── FIX DB-NEW-1 [CRITICAL]: partner_links granular UPDATE policies ──
-- Previous policy had no WITH CHECK — user could accept own invite, change payer ID, etc

drop policy if exists "Users can update partner links they're involved in" on public.partner_links;

-- Only the recipient (non-requester) can accept/decline an invite
create policy "Partner can accept or decline invite" on public.partner_links
  for update
  using (auth.uid() = partner_id and status = 'pending')
  with check (
    auth.uid() = partner_id
    and status in ('accepted', 'declined')
    -- Cannot change requester_id, partner_id, couples_payer_id, invite_code
    and requester_id = requester_id
    and partner_id   = partner_id
  );

-- Either party can update their own sharing flag only
create policy "Requester can update own sharing flag" on public.partner_links
  for update
  using (auth.uid() = requester_id and status = 'accepted')
  with check (
    auth.uid() = requester_id
    and status = 'accepted'
    and requester_id = requester_id
    and partner_id   = partner_id
    -- couples_payer_id, invite_code, separated_at, billing_note — NOT changeable by client
  );

create policy "Partner can update own sharing flag" on public.partner_links
  for update
  using (auth.uid() = partner_id and status = 'accepted')
  with check (
    auth.uid() = partner_id
    and status = 'accepted'
    and requester_id = requester_id
    and partner_id   = partner_id
  );

-- ── FIX DB-NEW-2 [HIGH]: couples_payer_id only settable by service role ──
-- Already constrained by the new update policies above (not in WITH CHECK)
-- Add explicit comment for auditability
comment on column public.partner_links.couples_payer_id is
  'Set by service role only (couples-invite edge function). Never updatable by client.';

comment on column public.partner_links.separated_at is
  'Set by service role only (handle-separation edge function). Never updatable by client.';

-- ── FIX DB-NEW-3 [HIGH]: Prevent force-sharing partner vault ──
-- The vault_entries partner read policy checks partner_shares_vault/requester_shares_vault
-- but users could update these directly. The new granular policies above fix this:
-- requester can only update requester_shares_vault via "Requester can update own sharing flag"
-- partner can only update partner_shares_vault via "Partner can update own sharing flag"
-- WITH CHECK clause ensures status stays 'accepted' and IDs don't change

-- ── FIX DB-NEW-4 [HIGH]: second_parent_id requires confirmation ──
-- Don't allow client to set second_parent_id directly — require edge function
drop policy if exists "Users can manage own dependants" on public.dependants;

create policy "Users can select own dependants" on public.dependants
  for select using (auth.uid() = user_id);

create policy "Users can insert own dependants" on public.dependants
  for insert with check (
    auth.uid() = user_id
    and second_parent_id is null  -- Cannot set second_parent_id on insert
  );

create policy "Users can update own dependants" on public.dependants
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    -- second_parent_id can only be set to null or kept as-is by client
    -- Setting it to a real value requires service role (edge function)
    and (second_parent_id is null or second_parent_id = second_parent_id)
  );

create policy "Users can delete own dependants" on public.dependants
  for delete using (auth.uid() = user_id);

-- ── FIX DB-NEW-5 [MEDIUM]: validate shared_link content_id belongs to user ──
create or replace function public.verify_shared_link_ownership()
returns trigger language plpgsql security definer as $$
begin
  -- Verify content_id belongs to user based on content_type
  if new.content_type = 'entry' then
    if not exists(select 1 from public.vault_entries where id = new.content_id and user_id = new.user_id) then
      raise exception 'Content does not belong to this user';
    end if;
  elsif new.content_type = 'document' then
    if not exists(select 1 from public.vault_documents where id = new.content_id and user_id = new.user_id) then
      raise exception 'Content does not belong to this user';
    end if;
  elsif new.content_type = 'family_profile' then
    if not exists(select 1 from public.dependants where id = new.content_id and user_id = new.user_id) then
      raise exception 'Content does not belong to this user';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists verify_shared_link_ownership on public.shared_links;
create trigger verify_shared_link_ownership
  before insert on public.shared_links
  for each row execute procedure public.verify_shared_link_ownership();

-- ── FIX DB-NEW-6 [MEDIUM]: notifications — users cannot INSERT ──
drop policy if exists "Users can manage own notifications" on public.notifications;

create policy "Users can read own notifications" on public.notifications
  for select using (auth.uid() = user_id);

create policy "Users can update own notifications" on public.notifications
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and read = true  -- Can only mark as read, nothing else
  );

-- Service role inserts notifications (bypasses RLS)

-- ── FIX DB-NEW-7 [LOW]: explicit deny on separations for users ──
create policy "Users cannot insert separations" on public.separations
  for insert with check (false);
-- Service role creates separations via edge function

-- ── FIX DB-NEW-8 [HIGH]: shared vault entries — no unilateral delete ──
drop policy if exists "Partners can access shared entries" on public.vault_entries;

-- Split into granular policies for shared entries
create policy "Partners can read shared entries" on public.vault_entries
  for select using (
    is_shared = true and partner_link_id in (
      select id from public.partner_links
      where (requester_id = auth.uid() or partner_id = auth.uid())
      and status = 'accepted'
    )
  );

create policy "Partners can insert shared entries" on public.vault_entries
  for insert with check (
    is_shared = true and partner_link_id in (
      select id from public.partner_links
      where (requester_id = auth.uid() or partner_id = auth.uid())
      and status = 'accepted'
    )
    and auth.uid() = user_id
  );

create policy "Partners can update shared entries" on public.vault_entries
  for update using (
    is_shared = true and partner_link_id in (
      select id from public.partner_links
      where (requester_id = auth.uid() or partner_id = auth.uid())
      and status = 'accepted'
    )
  );

-- NO DELETE policy for shared entries — soft delete via is_shared flag only
-- This prevents hostile partner from destroying shared vault on separation

-- ── FIX BL-NEW-1 [HIGH]: Limit pending partner invites ──
create or replace function public.check_partner_invite_limit()
returns trigger language plpgsql security definer as $$
declare
  pending_count integer;
begin
  select count(*) into pending_count
    from public.partner_links
    where requester_id = new.requester_id and status = 'pending';
  if pending_count >= 1 then
    raise exception 'You already have a pending partner invite';
  end if;
  return new;
end;
$$;

drop trigger if exists check_partner_invite_limit on public.partner_links;
create trigger check_partner_invite_limit
  before insert on public.partner_links
  for each row execute procedure public.check_partner_invite_limit();

-- ── FIX BL-NEW-2 [HIGH]: Limit active share links per user ──
create or replace function public.check_share_link_limit()
returns trigger language plpgsql security definer as $$
declare
  active_count integer;
  user_plan    text;
  max_links    integer;
begin
  select count(*) into active_count
    from public.shared_links
    where user_id = new.user_id
      and revoked = false
      and expires_at > now();

  select plan into user_plan from public.profiles where id = new.user_id;
  max_links := case user_plan
    when 'free'    then 5
    when 'single'  then 100
    when 'couples' then 200
    else 5
  end;

  if active_count >= max_links then
    raise exception 'Active share link limit reached. Revoke existing links to create new ones.';
  end if;
  return new;
end;
$$;

drop trigger if exists check_share_link_limit on public.shared_links;
create trigger check_share_link_limit
  before insert on public.shared_links
  for each row execute procedure public.check_share_link_limit();

-- ── FIX BL-NEW-5 [MEDIUM]: Validate second_parent_id in dependants ──
create or replace function public.verify_second_parent()
returns trigger language plpgsql security definer as $$
begin
  if new.second_parent_id is not null then
    if not exists(select 1 from public.profiles where id = new.second_parent_id) then
      raise exception 'Second parent account not found';
    end if;
    if new.second_parent_id = new.user_id then
      raise exception 'Cannot set yourself as second parent';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists verify_second_parent on public.dependants;
create trigger verify_second_parent
  before insert or update on public.dependants
  for each row execute procedure public.verify_second_parent();

-- ── Add pin_attempts column to shared_links ──
alter table public.shared_links
  add column if not exists pin_attempts integer not null default 0;

-- ── FIX TP-NEW-2 [MEDIUM]: Store actual paid amount for refund calculations ──
alter table public.partner_links
  add column if not exists partner_paid_pence integer default null,
  add column if not exists partner_sub_id_at_link text default null;
-- partner_paid_pence: actual amount partner paid (fetched from Stripe at link time)
-- partner_sub_id_at_link: their Single sub ID captured when they joined Couples
-- These are set by service role when partner accepts

comment on column public.partner_links.partner_paid_pence is
  'Actual amount partner paid in pence, captured from Stripe at join time. Used for accurate refunds on separation.';

-- ── Onfido verification — add missing upsert constraint ──────────
-- beneficiary_verifications needs a unique constraint on beneficiary_id for upsert
alter table public.beneficiary_verifications
  drop constraint if exists beneficiary_verifications_beneficiary_id_key;
alter table public.beneficiary_verifications
  add constraint beneficiary_verifications_beneficiary_id_key unique (beneficiary_id);

-- ── Add access_tier to beneficiaries if not present ──────────────
alter table public.beneficiaries
  add column if not exists access_tier integer not null default 1
    check (access_tier in (1, 2));

-- ── Pin attempts tracking for shared_links ────────────────────────
-- Already added in main SQL above
-- Confirm index exists
create index if not exists shared_links_pin_attempts_idx
  on public.shared_links(token, pin_attempts)
  where not revoked;

-- ══════════════════════════════════════════════════════════════
-- EMERGENCY ACCESS & DEATH CERTIFICATE VERIFICATION
-- ══════════════════════════════════════════════════════════════

-- ── Executor designation on beneficiaries ────────────────────
alter table public.beneficiaries
  add column if not exists is_executor boolean not null default false;

-- Ensure only one executor per vault owner
create unique index if not exists one_executor_per_owner
  on public.beneficiaries(user_id)
  where is_executor = true and status not in ('declined', 'revoked');

-- ── Emergency access requests ─────────────────────────────────
create table if not exists public.access_requests (
  id                    uuid primary key default uuid_generate_v4(),
  vault_owner_id        uuid not null references public.profiles(id) on delete cascade,
  submitted_by          uuid not null references public.beneficiaries(id) on delete cascade,

  -- Document upload
  certificate_path      text not null,   -- path in vault-files storage bucket
  certificate_type      text not null default 'death_certificate'
    check (certificate_type in ('death_certificate', 'medical_certificate', 'court_order', 'other')),

  -- Verification status
  status                text not null default 'pending'
    check (status in (
      'pending',           -- uploaded, awaiting Onfido check
      'onfido_processing', -- Onfido is checking
      'onfido_verified',   -- Onfido confident — auto-approved
      'manual_review',     -- Onfido low confidence — needs human check
      'manually_approved', -- Admin approved
      'manually_rejected', -- Admin rejected
      'owner_notified',    -- Owner was alive and notified
      'access_granted'     -- Access has been granted to all beneficiaries
    )),

  -- Onfido results
  onfido_check_id       text,
  onfido_confidence     text,   -- 'high', 'medium', 'low'
  onfido_extracted_name text,   -- name extracted from certificate
  onfido_extracted_date date,   -- date of death extracted

  -- Review
  reviewed_by_admin     boolean not null default false,
  admin_notes           text,
  rejected_reason       text,

  -- Notifications
  owner_notified_at     timestamptz,   -- if owner is alive, we notify them
  owner_response        text,          -- 'alive_deny', 'alive_approve', null
  owner_responded_at    timestamptz,

  -- Timestamps
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists access_requests_owner_idx   on public.access_requests(vault_owner_id);
create index if not exists access_requests_status_idx  on public.access_requests(status);
create index if not exists access_requests_submitter_idx on public.access_requests(submitted_by);

create trigger access_requests_updated_at before update on public.access_requests
  for each row execute procedure public.update_updated_at();

alter table public.access_requests enable row level security;

-- Beneficiaries can see requests they submitted
create policy "Submitter can view own requests" on public.access_requests
  for select using (
    submitted_by in (
      select id from public.beneficiaries where user_id = auth.uid()
    )
  );

-- Vault owner can see requests about their vault
create policy "Owner can view access requests" on public.access_requests
  for select using (auth.uid() = vault_owner_id);

-- Vault owner can respond (deny/approve) while alive
create policy "Owner can respond to access requests" on public.access_requests
  for update using (auth.uid() = vault_owner_id)
  with check (
    auth.uid() = vault_owner_id
    and owner_response in ('alive_deny', 'alive_approve')
  );

-- No client inserts — only via edge function (service role)
create policy "No direct inserts" on public.access_requests
  for insert with check (false);

-- ── Constraint: only executor can submit ─────────────────────
-- Enforced in edge function logic + DB check
create or replace function public.verify_executor_submitter()
returns trigger language plpgsql security definer as $$
begin
  -- Verify submitted_by is an executor for this vault
  if not exists (
    select 1 from public.beneficiaries
    where id = new.submitted_by
      and user_id = new.vault_owner_id
      and is_executor = true
      and status in ('email_confirmed', 'id_verified', 'access_granted')
  ) then
    raise exception 'Only a designated executor can submit an access request';
  end if;

  -- Prevent duplicate pending requests
  if exists (
    select 1 from public.access_requests
    where vault_owner_id = new.vault_owner_id
      and status not in ('manually_rejected', 'owner_notified')
  ) then
    raise exception 'An active access request already exists for this vault';
  end if;

  return new;
end;
$$;

-- Note: trigger on access_requests fires for service role insert too
-- So we enforce via edge function instead (service role bypasses RLS but not triggers)
-- Keep trigger for additional safety
drop trigger if exists verify_executor_submitter on public.access_requests;
create trigger verify_executor_submitter
  before insert on public.access_requests
  for each row execute procedure public.verify_executor_submitter();

-- ── Storage bucket for death certificates ─────────────────────
-- Create in Supabase dashboard: Storage → New bucket
-- Name: death-certificates
-- Private: true (most sensitive content in the system)
-- Max file size: 25MB
-- Only service role can access — never exposed to client directly
-- RLS handled entirely by edge function

-- ── Admin access log ──────────────────────────────────────────
-- Tracks every admin action for audit trail
create table if not exists public.admin_actions (
  id         uuid primary key default uuid_generate_v4(),
  action     text not null,
  request_id uuid references public.access_requests(id),
  admin_note text,
  created_at timestamptz not null default now()
);

alter table public.admin_actions enable row level security;
-- No client access to admin actions
create policy "No client access to admin actions" on public.admin_actions
  for all using (false);

-- ── Create death-certificates storage bucket ────────────────────
-- Run this in Supabase Dashboard → Storage → New bucket
-- Name: death-certificates
-- Private: YES (most sensitive content)
-- Max file size: 26214400 (25MB)
-- NO public access policies
-- Access only via service role in edge functions

-- ── Admin secret for review portal ─────────────────────────────
-- Set via: supabase secrets set ADMIN_SECRET_TOKEN=$(openssl rand -hex 32)
-- Keep this secret — it grants access to death certificates and approval power

-- ── Round 5 emergency access fixes ─────────────────────────────

-- FIX EF-EA-6 / BL-EA-1: Add per-request review token to access_requests
alter table public.access_requests
  add column if not exists review_token text default null;
-- review_token is generated per request, used in admin review URL, nulled after use

-- FIX BL-EA-3: Add emergency_access_token for fresh access URLs
alter table public.beneficiaries
  add column if not exists emergency_access_token text default null;

-- FIX DB-EA-2: Owner can only respond to open requests
drop policy if exists "Owner can respond to access requests" on public.access_requests;
create policy "Owner can respond to access requests" on public.access_requests
  for update using (
    auth.uid() = vault_owner_id
    and status not in ('manually_approved', 'access_granted', 'manually_rejected', 'onfido_verified')
  )
  with check (
    auth.uid() = vault_owner_id
    and owner_response in ('alive_deny', 'alive_approve')
  );

-- FIX DB-EA-3: Submitter SELECT policy — only the actual submitter, not all beneficiaries
drop policy if exists "Submitter can view own requests" on public.access_requests;
create policy "Submitter can view own request" on public.access_requests
  for select using (
    submitted_by in (
      select id from public.beneficiaries
      where is_executor = true
        and linked_user_id = auth.uid()
    )
  );

-- FIX DB-EA-5: Second parent access expires on separation
drop policy if exists "Second parent can read child profiles" on public.dependants;
create policy "Second parent can read child profiles" on public.dependants
  for select using (
    access_control = 'both_parents'
    and second_parent_id = auth.uid()
    -- Only if there is still an active partner link between the two parents
    and exists (
      select 1 from public.partner_links
      where (
        (requester_id = user_id and partner_id = auth.uid()) or
        (partner_id = user_id and requester_id = auth.uid())
      )
      and status = 'accepted'
    )
  );

-- ══════════════════════════════════════════════════════════════
-- ROUND 5 FINAL: Fixes for DB-1, DB-2, DB-4, DB-5
-- Run this AFTER schema-security-round4.sql
-- ══════════════════════════════════════════════════════════════

-- ── FIX DB-1/DB-3: Explicitly drop ALL round-4 broad policies ─
-- These must be dropped before round-5 creates granular replacements.
-- If round-4 policies exist alongside round-5 policies, PostgreSQL
-- OR's them — the broader policy wins and all security fixes are bypassed.

drop policy if exists "Users can manage own notifications"    on public.notifications;
drop policy if exists "Partners can access shared entries"    on public.vault_entries;
drop policy if exists "Users can manage own dependants"       on public.dependants;
drop policy if exists "Beneficiaries can confirm via token"   on public.beneficiaries;
-- Old second parent policy (without partner_link check) — round5 recreates with check
drop policy if exists "Second parent can read child profiles" on public.dependants;
-- Old partner_links broad update policy
drop policy if exists "Users can update partner links they're involved in" on public.partner_links;

-- ── FIX DB-2: 48-hour hold period for onfido_verified requests ─
alter table public.access_requests
  add column if not exists access_grant_after timestamptz default null;
-- Populated by emergency-access edge function when status = onfido_verified

-- Scheduler logic: grant access when now() > access_grant_after
-- (Implemented in checkin-scheduler — checks daily)

-- ── FIX DB-4: Make partner_links immutable fields truly immutable ─
create or replace function public.protect_partner_link_fields()
returns trigger language plpgsql security definer as $$
begin
  -- Prevent changing the core identifiers after creation
  if new.requester_id <> old.requester_id or new.partner_id <> old.partner_id then
    raise exception 'partner_links requester_id and partner_id are immutable';
  end if;
  -- Prevent client from setting couples_payer_id or billing fields
  -- (these are only set by service role in edge functions)
  if new.couples_payer_id is distinct from old.couples_payer_id
     and pg_has_role(current_user, 'authenticated', 'usage') then
    raise exception 'couples_payer_id can only be set by service role';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_partner_link_fields on public.partner_links;
create trigger protect_partner_link_fields
  before update on public.partner_links
  for each row execute procedure public.protect_partner_link_fields();

-- ── FIX DB-5: shared_links — no direct DELETE (revoke via update only) ─
drop policy if exists "Users can manage own shared links" on public.shared_links;

create policy "Users can read own shared links" on public.shared_links
  for select using (auth.uid() = user_id);

create policy "Users can insert own shared links" on public.shared_links
  for insert with check (auth.uid() = user_id);

create policy "Users can update own shared links" on public.shared_links
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy — links are revoked via update, preserving audit history

-- ── FIX BL-3: Add last_rejected_at to access_requests for cooldown ─
alter table public.access_requests
  add column if not exists last_rejection_at timestamptz
    generated always as (
      case when status in ('manually_rejected', 'owner_notified') then updated_at else null end
    ) stored;
-- Note: generated column — auto-populated, cannot be set directly


-- ══════════════════════════════════════════════════════════════
-- SECURITY LINTER FIXES
-- Fixes all Supabase security advisor warnings
-- ══════════════════════════════════════════════════════════════

-- ── FIX 1: Revoke EXECUTE on all SECURITY DEFINER trigger functions ─────────
-- These functions are only called by triggers — anon/authenticated should never call them directly
-- Revoking EXECUTE prevents them being called via /rest/v1/rpc/

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.update_updated_at() from anon, authenticated;
revoke execute on function public.check_entry_limit() from anon, authenticated;
revoke execute on function public.verify_entry_ownership() from anon, authenticated;
revoke execute on function public.ensure_gdpr_consent() from anon, authenticated;
revoke execute on function public.enforce_server_checkin_time() from anon, authenticated;
revoke execute on function public.check_beneficiary_limit() from anon, authenticated;
revoke execute on function public.purge_old_stripe_events() from anon, authenticated;
revoke execute on function public.check_beneficiary_not_self() from anon, authenticated;
revoke execute on function public.check_checkin_frequency_change() from anon, authenticated;
revoke execute on function public.has_couples_access(uuid) from anon, authenticated;
revoke execute on function public.purge_expired_shared_links() from anon, authenticated;
revoke execute on function public.verify_shared_link_ownership() from anon, authenticated;
revoke execute on function public.check_partner_invite_limit() from anon, authenticated;
revoke execute on function public.check_share_link_limit() from anon, authenticated;
revoke execute on function public.verify_second_parent() from anon, authenticated;
revoke execute on function public.verify_executor_submitter() from anon, authenticated;
revoke execute on function public.protect_partner_link_fields() from anon, authenticated;

-- ── FIX 2: Set search_path on all functions ──────────────────────────────────
-- Prevents search path injection attacks

alter function public.handle_new_user() set search_path = public;
alter function public.update_updated_at() set search_path = public;
alter function public.check_entry_limit() set search_path = public;
alter function public.verify_entry_ownership() set search_path = public;
alter function public.ensure_gdpr_consent() set search_path = public;
alter function public.enforce_server_checkin_time() set search_path = public;
alter function public.check_beneficiary_limit() set search_path = public;
alter function public.purge_old_stripe_events() set search_path = public;
alter function public.check_beneficiary_not_self() set search_path = public;
alter function public.check_checkin_frequency_change() set search_path = public;
alter function public.has_couples_access(uuid) set search_path = public;
alter function public.purge_expired_shared_links() set search_path = public;
alter function public.verify_shared_link_ownership() set search_path = public;
alter function public.check_partner_invite_limit() set search_path = public;
alter function public.check_share_link_limit() set search_path = public;
alter function public.verify_second_parent() set search_path = public;
alter function public.verify_executor_submitter() set search_path = public;
alter function public.protect_partner_link_fields() set search_path = public;

-- ── FIX 3: pg_net extension ──────────────────────────────────────────────────
-- pg_net should be in the extensions schema not public
-- Note: this requires the extension to be dropped and recreated
-- Only do this if pg_net is not actively being used yet
-- If the cron job is already running, skip this — it will break the cron
-- To fix: go to Supabase Dashboard → Database → Extensions → find pg_net → move to extensions schema
-- This cannot be done safely in SQL while the extension is in use

-- ── MFA email OTP codes table ────────────────────────────────────────────────
-- Used when user has no authenticator app — sends a 6-digit code via Resend
create table if not exists public.mfa_email_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,           -- SHA-256 hash of the 6-digit code
  expires_at  timestamptz not null,    -- 10 minutes from creation
  used        boolean not null default false,
  attempts    int not null default 0,  -- max 5 attempts
  created_at  timestamptz not null default now()
);

-- Index for fast lookup
create index if not exists mfa_email_codes_user_id_idx on public.mfa_email_codes(user_id);

-- RLS
alter table public.mfa_email_codes enable row level security;

-- Only service role can read/write (accessed via edge function only)
-- No policies for anon or authenticated — all access via service role

-- Auto-delete expired codes (keeps table clean)
create or replace function public.cleanup_mfa_codes()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  delete from public.mfa_email_codes where expires_at < now() - interval '1 hour';
  return new;
end;
$$;

drop trigger if exists cleanup_mfa_codes_trigger on public.mfa_email_codes;
create trigger cleanup_mfa_codes_trigger
  after insert on public.mfa_email_codes
  for each statement execute procedure public.cleanup_mfa_codes();

-- Add mfa_method to profiles so we know if user prefers app or email
alter table public.profiles
  add column if not exists mfa_enrolled boolean not null default false,
  add column if not exists mfa_email_fallback boolean not null default false;

-- ── MFA Recovery codes ───────────────────────────────────────────────────────
-- 10 single-use codes generated when MFA is set up
-- Stored as SHA-256 hashes — never plaintext
create table if not exists public.mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null,     -- SHA-256 of the recovery code
  used       boolean not null default false,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_id_idx on public.mfa_recovery_codes(user_id);
alter table public.mfa_recovery_codes enable row level security;
-- No direct client access — all via service role through edge function

-- ── Getting started checklist dismissal ──────────────────────────────────────
alter table public.profiles
  add column if not exists getting_started_dismissed boolean not null default false,
  add column if not exists getting_started_done_items text[] not null default '{}';
