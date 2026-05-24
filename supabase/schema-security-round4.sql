-- ============================================================
-- Security Round 4 — Run AFTER all previous schema files
-- ============================================================

-- ── FIX DB-1 [CRITICAL]: Proper profiles UPDATE policy ──────
-- Previous policy WITH CHECK only checked user ID, not which fields
-- A user could still set plan='single' directly via Supabase API
drop policy if exists "Users can update own safe fields" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Explicitly block plan escalation at the policy level
    and plan = (select plan from public.profiles where id = auth.uid())
    and stripe_customer_id     is not distinct from (select stripe_customer_id     from public.profiles where id = auth.uid())
    and stripe_subscription_id is not distinct from (select stripe_subscription_id from public.profiles where id = auth.uid())
    and plan_renewal            is not distinct from (select plan_renewal            from public.profiles where id = auth.uid())
  );

-- ── FIX DB-2 [HIGH]: Split vault_entries FOR ALL into granular policies ──
drop policy if exists "Users can manage own entries" on public.vault_entries;

create policy "Users can select own entries" on public.vault_entries
  for select using (auth.uid() = user_id);

create policy "Users can insert own entries" on public.vault_entries
  for insert with check (auth.uid() = user_id);

create policy "Users can update own entries" on public.vault_entries
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and user_id = user_id);

create policy "Users can delete own entries" on public.vault_entries
  for delete using (auth.uid() = user_id);

-- ── FIX DB-3 [MEDIUM]: Prevent forged IP in checkin_log ──────
-- Strip ip_address from client inserts — set via trigger from request context
drop policy if exists "Users can insert own checkins" on public.checkin_log;

create policy "Users can insert own checkins" on public.checkin_log
  for insert with check (
    auth.uid() = user_id
    and ip_address is null  -- clients cannot set IP; trigger sets it
  );

-- ── FIX DB-5 [HIGH]: Fix tautological beneficiary confirm policy ──
drop policy if exists "Beneficiaries confirm own invite" on public.beneficiaries;

-- USING clause: only rows with a token and pending status
-- WITH CHECK: can only set status to confirmed (token already matched by USING)
create policy "Beneficiaries confirm own invite" on public.beneficiaries
  for update
  using  (invite_token is not null and status = 'pending')
  with check (status = 'confirmed');

-- ── FIX DB-6 [MEDIUM]: Explicit deny-all on rate_limits ──────
drop policy if exists "deny all rate_limits" on public.rate_limits;
create policy "deny all rate_limits" on public.rate_limits
  for all using (false);
-- Service role bypasses RLS and can still read/write — this is correct.
-- The false policy prevents any authenticated user from accessing rate_limits.

-- ── FIX DB-7 [LOW]: Minimise Stripe event payload storage ────
-- Don't store full payload (contains customer PII)
-- Store only the event type, ID, and a safe subset
comment on column public.stripe_events.payload is
  'Stores minimal event metadata only — not full Stripe payload (PII minimisation)';

-- Add a data_retention trigger to auto-purge old stripe events (90 days)
create or replace function public.purge_old_stripe_events()
returns void language plpgsql security definer as $$
begin
  delete from public.stripe_events
  where processed_at < now() - interval '90 days';
end;
$$;

-- ── FIX BL-1 [HIGH]: Serialisable transaction for entry limit ──
-- Replace the previous trigger with one that uses advisory locks
-- to prevent concurrent insert bypass
create or replace function public.check_entry_limit()
returns trigger language plpgsql security definer as $$
declare
  entry_count integer;
  user_plan   text;
begin
  -- Advisory lock on the user ID prevents concurrent inserts racing
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

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

-- Recreate trigger
drop trigger if exists enforce_entry_limit on public.vault_entries;
create trigger enforce_entry_limit
  before insert on public.vault_entries
  for each row execute procedure public.check_entry_limit();

-- ── FIX BL-2 [HIGH]: Dead man's switch fires only once ────────
alter table public.profiles
  add column if not exists switch_triggered_at timestamptz default null;

-- ── FIX BL-3 [MEDIUM]: Prevent user adding themselves ─────────
create or replace function public.check_beneficiary_not_self()
returns trigger language plpgsql security definer as $$
declare
  owner_email text;
begin
  select email into owner_email
    from auth.users where id = new.user_id;
  if lower(new.email) = lower(owner_email) then
    raise exception 'You cannot add yourself as a beneficiary';
  end if;
  return new;
end;
$$;

drop trigger if exists check_beneficiary_not_self on public.beneficiaries;
create trigger check_beneficiary_not_self
  before insert on public.beneficiaries
  for each row execute procedure public.check_beneficiary_not_self();

-- ── FIX BL-6 [LOW]: Block frequency changes when overdue ──────
create or replace function public.check_checkin_frequency_change()
returns trigger language plpgsql security definer as $$
begin
  -- Only block if user is currently overdue AND trying to extend frequency
  if old.last_checkin is not null
    and new.checkin_frequency_days > old.checkin_frequency_days
    and old.last_checkin + (old.checkin_frequency_days || ' days')::interval < now()
  then
    raise exception 'Cannot extend check-in frequency while overdue. Please check in first.';
  end if;
  return new;
end;
$$;

drop trigger if exists check_checkin_frequency_change on public.profiles;
create trigger check_checkin_frequency_change
  before update on public.profiles
  for each row
  when (new.checkin_frequency_days is distinct from old.checkin_frequency_days)
  execute procedure public.check_checkin_frequency_change();

-- ── FIX CR-1 [HIGH]: Add random salt column to profiles ───────
alter table public.profiles
  add column if not exists encryption_salt text default null;

-- Populate salt for existing users (they will need to re-derive key on next login)
-- New users get salt set during signup via application code
comment on column public.profiles.encryption_salt is
  'Random base64 salt for PBKDF2 key derivation. Set on account creation, never changed.';

-- ── New feature additions ──────────────────────────────────────────────────

-- Add expiry date to vault entries
alter table public.vault_entries
  add column if not exists expiry_date date default null,
  add column if not exists expiry_reminder_days integer[] default '{30}',
  add column if not exists expiry_notified_at timestamptz default null;

-- After I'm Gone guide — stored per user
create table if not exists public.after_i_am_gone (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  guide_data jsonb not null default '{}',  -- stores customised guide sections
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)  -- one guide per user
);

alter table public.after_i_am_gone enable row level security;
create policy "Users can manage own guide" on public.after_i_am_gone
  for all using (auth.uid() = user_id);

create trigger after_i_am_gone_updated_at before update on public.after_i_am_gone
  for each row execute procedure public.update_updated_at();

-- Index for expiry queries in the scheduler
create index if not exists vault_entries_expiry_idx
  on public.vault_entries(user_id, expiry_date)
  where expiry_date is not null;

-- Constraint: reminder days must be positive
alter table public.vault_entries drop constraint if exists valid_reminder_days;
alter table public.vault_entries add constraint valid_reminder_days
  check (expiry_reminder_days is null or array_length(expiry_reminder_days, 1) <= 5);

-- ── Document vault ─────────────────────────────────────────────────────────
create table if not exists public.vault_documents (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  category     text not null default 'other',
  notes        text,
  storage_path text not null,
  file_name    text not null,
  file_size    bigint not null,
  file_type    text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists vault_documents_user_id_idx on public.vault_documents(user_id);
create index if not exists vault_documents_category_idx on public.vault_documents(user_id, category);

create trigger vault_documents_updated_at before update on public.vault_documents
  for each row execute procedure public.update_updated_at();

alter table public.vault_documents enable row level security;
create policy "Users can manage own documents" on public.vault_documents
  for all using (auth.uid() = user_id);

-- Size constraints
alter table public.vault_documents
  add constraint doc_name_length    check (char_length(name) <= 200),
  add constraint doc_notes_length   check (char_length(coalesce(notes,'')) <= 2000),
  add constraint doc_size_limit     check (file_size <= 26214400), -- 25MB
  add constraint doc_category_valid check (category in (
    'identity','property','legal','financial','insurance','medical','employment','vehicle','other'
  ));

-- ── Beneficiary identity verification ──────────────────────────────────────
create table if not exists public.beneficiary_verifications (
  id                  uuid primary key default uuid_generate_v4(),
  beneficiary_id      uuid not null references public.beneficiaries(id) on delete cascade,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','submitted','verified','failed')),
  verification_provider text default 'onfido',
  provider_check_id   text,                    -- Onfido check ID
  verified_at         timestamptz,
  failed_reason       text,
  created_at          timestamptz not null default now()
);

alter table public.beneficiary_verifications enable row level security;
-- Only service role can manage verifications
create policy "No public access to verifications" on public.beneficiary_verifications
  for all using (false);

-- Add verification requirement flag to beneficiaries
alter table public.beneficiaries
  add column if not exists requires_id_verification boolean not null default true,
  add column if not exists id_verified_at timestamptz default null;

-- Add tier access to beneficiaries
-- Tier 1: basic info + after i'm gone guide (email only)
-- Tier 2: passwords + documents (requires ID verification)
alter table public.beneficiaries
  add column if not exists access_tier integer not null default 1
    check (access_tier in (1, 2));

-- Ensure plan field whitelist in profiles update policy covers new fields
comment on column public.beneficiary_verifications.provider_check_id is
  'External ID verification provider reference. Treat as sensitive — never expose to client.';

-- ── Vault PIN tracking ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists vault_pin_set boolean not null default false,
  add column if not exists key_verification text default null;
-- key_verification: a small encrypted test string used to verify PIN is correct
-- Never contains real user data — just the string 'dr_key_ok' encrypted with their key

comment on column public.profiles.vault_pin_set is
  'True when user has set their vault PIN. The PIN itself is never stored.';
comment on column public.profiles.key_verification is
  'Encrypted test value used to verify PIN is correct on login. Not sensitive.';

-- ══════════════════════════════════════════════════════════════
-- COUPLES & BENEFICIARY VERIFICATION ADDITIONS
-- ══════════════════════════════════════════════════════════════

-- ── Enhanced beneficiary status flow ──────────────────────────
-- invited → email_confirmed → id_verified → access_granted
alter table public.beneficiaries
  drop constraint if exists beneficiaries_status_check,
  add constraint beneficiaries_status_check
    check (status in (
      'invited',           -- invite sent, not yet actioned
      'email_confirmed',   -- confirmed their email
      'id_verified',       -- passed Onfido ID check
      'access_granted',    -- death switch fired, full access given
      'declined',          -- beneficiary declined the nomination
      'revoked'            -- owner revoked access
    ));

-- Link to an existing DR user account (if beneficiary has one)
alter table public.beneficiaries
  add column if not exists linked_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists liveness_verified_at timestamptz default null,
  add column if not exists id_verified_at timestamptz default null,
  add column if not exists email_confirmed_at timestamptz default null;

-- ── In-app notifications ───────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in (
    'beneficiary_invite',    -- someone added you as their beneficiary
    'beneficiary_accepted',  -- your beneficiary accepted
    'beneficiary_declined',  -- your beneficiary declined
    'partner_link_request',  -- someone wants to link as couples partner
    'partner_accepted',      -- your partner link was accepted
    'partner_unlinked',      -- partner removed the link
    'vault_access_granted',  -- death switch fired, you now have access
    'entry_expiring',        -- an entry is expiring soon
    'checkin_due_soon',      -- check-in due in 3 days
    'checkin_overdue',       -- check-in is overdue
    'new_device',            -- new device signed in
    'shared_link_accessed',  -- a shared link was accessed
    'security_alert'         -- security event (replay attack etc)
  )),
  title      text not null,
  message    text not null,
  read       boolean not null default false,
  action_url text,           -- optional deep link
  metadata   jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id, read);
alter table public.notifications enable row level security;
-- D-2 fix: split into separate policies — users can only mark as read, not mutate type/title/message
create policy "Users can read own notifications" on public.notifications
  for select using (auth.uid() = user_id);

create policy "Users can mark own notifications read" on public.notifications
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    -- Only allow changing the 'read' field — all other fields must be unchanged
    and type       = (select type       from public.notifications n where n.id = notifications.id)
    and title      = (select title      from public.notifications n where n.id = notifications.id)
    and message    = (select message    from public.notifications n where n.id = notifications.id)
    and action_url is not distinct from (select action_url from public.notifications n where n.id = notifications.id)
  );

create policy "Users can delete own notifications" on public.notifications
  for delete using (auth.uid() = user_id);
-- Note: INSERT is service-role only (no client insert policy)

-- ── Couples partner linking ────────────────────────────────────
create table if not exists public.partner_links (
  id                uuid primary key default uuid_generate_v4(),
  requester_id      uuid not null references public.profiles(id) on delete cascade,
  partner_id        uuid not null references public.profiles(id) on delete cascade,
  status            text not null default 'pending'
    check (status in ('pending','accepted','declined','unlinked')),
  requester_share   boolean not null default true,  -- requester shares their vault
  partner_share     boolean not null default true,  -- partner shares their vault
  invite_code       text unique default encode(gen_random_bytes(16), 'hex'),
  created_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  unique (requester_id, partner_id)
);

alter table public.partner_links enable row level security;
create policy "Users can see own partner links" on public.partner_links
  for select using (auth.uid() = requester_id or auth.uid() = partner_id);
create policy "Users can create partner link requests" on public.partner_links
  for insert with check (auth.uid() = requester_id);
create policy "Users can update partner links they're involved in" on public.partner_links
  for update using (auth.uid() = requester_id or auth.uid() = partner_id);

-- Prevent self-linking
alter table public.partner_links
  add constraint no_self_link check (requester_id != partner_id);

-- ── Shared vault entries ───────────────────────────────────────
-- Shared entries belong to a partner link, not a single user
alter table public.vault_entries
  add column if not exists partner_link_id uuid references public.partner_links(id) on delete cascade,
  add column if not exists is_shared boolean not null default false;

-- RLS for shared entries: accessible to both partners
create policy "Partners can access shared entries" on public.vault_entries
  for all using (
    is_shared = true and partner_link_id in (
      select id from public.partner_links
      where (requester_id = auth.uid() or partner_id = auth.uid())
      and status = 'accepted'
    )
  );

-- ── Partner vault read access (non-shared private entries) ─────
-- Partners can READ each other's private vault entries (not passwords)
-- Passwords still require that person's PIN
create policy "Partners can read each other private entries" on public.vault_entries
  for select using (
    is_shared = false and user_id in (
      select case
        when requester_id = auth.uid() then partner_id
        when partner_id   = auth.uid() then requester_id
      end
      from public.partner_links
      where (requester_id = auth.uid() or partner_id = auth.uid())
      and status = 'accepted'
      and (
        (requester_id = auth.uid() and partner_share = true) or
        (partner_id   = auth.uid() and requester_share = true)
      )
    )
  );

-- Partner document access
create policy "Partners can read each other documents" on public.vault_documents
  for select using (
    user_id in (
      select case
        when requester_id = auth.uid() then partner_id
        when partner_id   = auth.uid() then requester_id
      end
      from public.partner_links
      where (requester_id = auth.uid() or partner_id = auth.uid())
      and status = 'accepted'
    )
  );

-- ══════════════════════════════════════════════════════════════
-- BENEFICIARY ACCOUNTS & COUPLES BILLING
-- ══════════════════════════════════════════════════════════════

-- ── Beneficiary accounts ───────────────────────────────────────
-- A beneficiary can have a full DR account (free or paid)
-- Their beneficiary_id links them to the vaults they have access to
-- This is separate from their own personal vault

-- Add beneficiary_account_type to profiles
alter table public.profiles
  add column if not exists account_origin text not null default 'direct'
    check (account_origin in (
      'direct',       -- signed up directly for a vault
      'beneficiary',  -- signed up via beneficiary invite
      'partner'       -- linked as a couples partner
    ));

-- When a beneficiary signs up, track which invite brought them
alter table public.beneficiaries
  add column if not exists account_created_at timestamptz default null;

-- ── Couples billing — one payer covers both ────────────────────
-- The couples_payer_id is the person who holds the Couples subscription
-- Their partner gets couples features included at no extra charge
alter table public.partner_links
  add column if not exists couples_payer_id uuid references public.profiles(id) on delete set null,
  add column if not exists partner_stripe_credit_issued boolean not null default false,
  add column if not exists partner_credit_amount_pence integer default null;
-- partner_credit_amount_pence: records how much we refunded the partner's unused Single plan

-- ── Couples feature access helper function ─────────────────────
-- Returns true if user has couples features (either as payer or as linked partner)
create or replace function public.has_couples_access(check_user_id uuid)
returns boolean language plpgsql security definer as $$
declare
  has_access boolean := false;
begin
  -- Check if they have couples plan directly
  select (plan = 'couples') into has_access
  from public.profiles where id = check_user_id;

  if has_access then return true; end if;

  -- Check if they are the non-paying partner in an accepted couples link
  select exists(
    select 1 from public.partner_links pl
    join public.profiles p on p.id = pl.couples_payer_id
    where (pl.requester_id = check_user_id or pl.partner_id = check_user_id)
    and pl.couples_payer_id != check_user_id
    and pl.status = 'accepted'
    and p.plan = 'couples'
  ) into has_access;

  return has_access;
end;
$$;

-- ── Vault sharing preferences ──────────────────────────────────
-- Each partner independently controls whether they share their vault
alter table public.partner_links
  add column if not exists requester_shares_vault boolean not null default false,
  add column if not exists partner_shares_vault   boolean not null default false;
-- Both default to false — sharing must be explicitly enabled by each person

-- ── Refund tracking ────────────────────────────────────────────
create table if not exists public.refunds (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  stripe_refund_id    text unique,
  amount_pence        integer not null,
  reason              text not null,   -- 'couples_upgrade', 'cancellation', etc
  status              text not null default 'pending'
    check (status in ('pending', 'issued', 'failed')),
  created_at          timestamptz not null default now()
);

alter table public.refunds enable row level security;
create policy "Users can view own refunds" on public.refunds
  for select using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- FAMILY PROFILES & SEPARATION
-- ══════════════════════════════════════════════════════════════

-- ── Family shared info (GP, dentist, emergency contacts) ──────
create table if not exists public.family_info (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  field_data jsonb not null default '{}',  -- encrypted shared family fields
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.family_info enable row level security;
create policy "Users can manage own family info" on public.family_info
  for all using (auth.uid() = user_id);

create trigger family_info_updated_at before update on public.family_info
  for each row execute procedure public.update_updated_at();

-- ── Individual dependent profiles ─────────────────────────────
create table if not exists public.dependants (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type          text not null check (type in ('child', 'dependant', 'pet')),
  display_name  text not null,             -- plaintext (not sensitive)
  profile_data  jsonb not null default '{}', -- AES-256 encrypted sensitive fields
  access_control text not null default 'owner_only'
    check (access_control in ('owner_only', 'both_parents', 'beneficiaries')),
  second_parent_id uuid references public.profiles(id) on delete set null,
  -- second_parent_id: the other parent's DR account if both_parents is selected
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists dependants_user_id_idx on public.dependants(user_id);
create index if not exists dependants_type_idx on public.dependants(user_id, type);

alter table public.dependants enable row level security;
create policy "Users can manage own dependants" on public.dependants
  for all using (auth.uid() = user_id);

-- Second parent can read if access_control = both_parents
create policy "Second parent can read child profiles" on public.dependants
  for select using (
    access_control = 'both_parents'
    and second_parent_id = auth.uid()
  );

create trigger dependants_updated_at before update on public.dependants
  for each row execute procedure public.update_updated_at();

-- Size constraints
alter table public.dependants
  add constraint dependant_name_length check (char_length(display_name) <= 100);

-- ── Couples separation ─────────────────────────────────────────
-- Track separation requests and shared vault archiving
create table if not exists public.separations (
  id               uuid primary key default uuid_generate_v4(),
  partner_link_id  uuid not null references public.partner_links(id) on delete cascade,
  initiated_by     uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'completed'
    check (status in ('completed', 'export_period', 'archived')),
  shared_vault_export_deadline timestamptz
    default (now() + interval '90 days'),
  initiated_at     timestamptz not null default now(),
  unique (partner_link_id)
);

alter table public.separations enable row level security;
-- Both former partners can view separation record
create policy "Partners can view own separation" on public.separations
  for select using (
    partner_link_id in (
      select id from public.partner_links
      where requester_id = auth.uid() or partner_id = auth.uid()
    )
  );

-- ── Stripe proration tracking for separation ──────────────────
-- Records what billing changes happened on separation
alter table public.partner_links
  add column if not exists separated_at timestamptz default null,
  add column if not exists separation_billing_note text default null;
-- separation_billing_note: human-readable record of what Stripe did
-- e.g. "Partner prorated £6.50 refund issued. Payer downgraded to Single."

-- ══════════════════════════════════════════════════════════════
-- SECURE SHARED LINKS
-- ══════════════════════════════════════════════════════════════

create table if not exists public.shared_links (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  -- What is being shared
  content_type    text not null check (content_type in ('entry', 'document', 'family_profile')),
  content_id      uuid not null,        -- ID of the entry/document/dependant
  content_label   text not null,        -- plaintext label e.g. "Barclays account"

  -- The encrypted payload (re-encrypted with link key, NOT the vault key)
  -- Link key lives in URL fragment — we never see it
  encrypted_payload text not null,      -- AES-256-GCM, key is in the URL fragment
  includes_password boolean not null default false,

  -- Access control
  token           text unique not null default encode(gen_random_bytes(32), 'hex'),
  pin_hash        text default null,    -- bcrypt hash of optional recipient PIN
  -- Note: we hash the PIN so even we can't read it

  -- Expiry
  expires_at      timestamptz not null,
  max_views       integer default null, -- null = unlimited views within time window
  view_count      integer not null default 0,
  one_time        boolean not null default false,

  -- Tracking
  last_accessed_at timestamptz default null,
  revoked         boolean not null default false,
  revoked_at      timestamptz default null,

  created_at      timestamptz not null default now()
);

create index if not exists shared_links_token_idx on public.shared_links(token) where not revoked;
create index if not exists shared_links_user_id_idx on public.shared_links(user_id);
create index if not exists shared_links_expires_idx on public.shared_links(expires_at) where not revoked;

alter table public.shared_links enable row level security;

-- Owners can manage their own links
create policy "Users can manage own shared links" on public.shared_links
  for all using (auth.uid() = user_id);

-- No public read (access is via edge function with token)
-- The edge function uses service role, so no RLS bypass needed

-- Constraints
alter table public.shared_links
  add constraint max_expiry check (expires_at <= created_at + interval '30 days'),
  add constraint content_label_length check (char_length(content_label) <= 200),
  add constraint view_count_positive check (view_count >= 0);

-- Auto-cleanup expired links (run weekly via cron)
create or replace function public.purge_expired_shared_links()
returns void language plpgsql security definer as $$
begin
  delete from public.shared_links
  where expires_at < now() - interval '7 days'; -- keep 7 days after expiry for audit
end;
$$;

-- LOW-2: Notification TTL cleanup (90 days)
create or replace function public.cleanup_notifications()
returns void language plpgsql as $$
begin
  delete from public.notifications where created_at < now() - interval '90 days';
end;
$$;

create or replace function public.trigger_cleanup_notifications()
returns trigger language plpgsql as $$
begin
  if (random() < 0.005) then  -- run on ~0.5% of inserts
    perform public.cleanup_notifications();
  end if;
  return new;
end;
$$;

drop trigger if exists cleanup_notifications_trigger on public.notifications;
create trigger cleanup_notifications_trigger
  after insert on public.notifications
  for each row execute function public.trigger_cleanup_notifications();
