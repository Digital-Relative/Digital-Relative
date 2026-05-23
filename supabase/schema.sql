-- ============================================================
-- Legatum — Supabase Database Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Profiles ──────────────────────────────────────────────
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  full_name              text,
  plan                   text not null default 'free' check (plan in ('free','single','couples')),
  plan_renewal           timestamptz,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  last_checkin           timestamptz,
  checkin_frequency_days integer not null default 30,
  gdpr_consent_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Auto-create profile on sign up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, gdpr_consent_at, marketing_opt_in)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    now(),
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.update_updated_at();

-- RLS
alter table public.profiles enable row level security;
create policy "Users can view own profile"   on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);


-- ── Vault entries ──────────────────────────────────────────
create table if not exists public.vault_entries (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  category    text not null default 'other',
  title       text not null,               -- plaintext (non-sensitive)
  username    text,                        -- AES-256-GCM encrypted
  password    text,                        -- AES-256-GCM encrypted
  notes       text,                        -- AES-256-GCM encrypted
  _encrypted  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vault_entries_user_id_idx on public.vault_entries(user_id);
create index if not exists vault_entries_category_idx on public.vault_entries(user_id, category);

create trigger vault_entries_updated_at before update on public.vault_entries
  for each row execute procedure public.update_updated_at();

alter table public.vault_entries enable row level security;
create policy "Users can manage own entries" on public.vault_entries
  for all using (auth.uid() = user_id);


-- ── Beneficiaries ──────────────────────────────────────────
create table if not exists public.beneficiaries (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  relation     text,
  email        text not null,
  access_level text not null default 'Full access' check (access_level in ('Full access','Read only','Specific categories only')),
  status       text not null default 'invited' check (status in ('invited','email_confirmed','id_verified','access_granted','declined','revoked')),
  invite_token text unique default encode(gen_random_bytes(32), 'hex'),
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists beneficiaries_user_id_idx on public.beneficiaries(user_id);

alter table public.beneficiaries enable row level security;
create policy "Users can manage own beneficiaries" on public.beneficiaries
  for all using (auth.uid() = user_id);

-- Beneficiaries can confirm via token (no auth needed)
create policy "Beneficiaries can confirm via token" on public.beneficiaries
  for update using (invite_token is not null)
  with check (status = 'email_confirmed');


-- ── Checkin log ────────────────────────────────────────────
create table if not exists public.checkin_log (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  ip_address text
);

alter table public.checkin_log enable row level security;
create policy "Users can view own checkins" on public.checkin_log for select using (auth.uid() = user_id);
create policy "Users can insert own checkins" on public.checkin_log for insert with check (auth.uid() = user_id);


-- ── Stripe webhook events (idempotency) ────────────────────
create table if not exists public.stripe_events (
  id         text primary key,   -- Stripe event ID
  type       text not null,
  payload    jsonb,
  processed_at timestamptz not null default now()
);

-- Only service role can write stripe events
alter table public.stripe_events enable row level security;


-- ── Storage bucket ─────────────────────────────────────────
-- Run in Supabase Dashboard → Storage → New bucket
-- Name: vault-files, Private: true, Max file size: 5GB
-- RLS handled by Supabase storage policies (set in dashboard)
