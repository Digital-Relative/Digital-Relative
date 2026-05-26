-- ══════════════════════════════════════════════════════════════
-- partner_links — invite_email column
-- ──────────────────────────────────────────────────────────────
-- The couples-invite edge function previously took an email body
-- param, looked the partner up by email, and discarded the email
-- after sending. That meant resend was impossible — we had no
-- record of who to re-send to (for non-existing partners no
-- profile exists; for existing partners we'd need auth.admin
-- lookups by partner_id, which couples-invite already does).
--
-- This column stores the originally-invited email on every insert
-- so a { action: 'resend', linkId } request can re-send without
-- any further client input.
--
-- Visibility: text email — not sensitive in the security sense
-- (same email is in auth.users for the existing-partner case);
-- for the non-existing-partner case it's the only place we know
-- it. Owner can see their own row's invite_email via the existing
-- "Users can see own partner links" SELECT policy.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════

alter table public.partner_links
  add column if not exists invite_email text default null;
