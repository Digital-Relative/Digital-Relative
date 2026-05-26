-- ══════════════════════════════════════════════════════════════
-- RLS drift fix — drop orphaned policies that should already
-- have been removed by schema-security-round5.sql
-- ──────────────────────────────────────────────────────────────
-- Surfaced by diffing pg_policies CSV against the schema files.
-- These policies are still present in the deployed dashboard even
-- though round 5 / round 6 explicitly drop them. Each one defeats
-- hardening that the granular replacements were meant to enforce.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════

-- ── vault_entries ──────────────────────────────────────────
-- Round 5 (line 145-168) splits this into granular Partners can
-- read / insert / update shared entries — deliberately NO delete.
-- The broad FOR ALL policy below lets partners DELETE shared
-- vault entries unilaterally, defeating that hardening.
drop policy if exists "Partners can access shared entries" on public.vault_entries;

-- Owner CRUD is covered by the four granular policies (Users can
-- select / insert / update / delete own entries). The broad FOR
-- ALL below shadows them and makes intent harder to audit. No
-- security impact for owner self-access, but drop for clarity.
drop policy if exists "Users can manage own entries" on public.vault_entries;

-- ── beneficiaries ──────────────────────────────────────────
-- Both of these UPDATE policies let ANY authenticated user mark
-- ANY beneficiary row as confirmed:
--
--   "Beneficiaries can confirm via token"
--     USING (invite_token IS NOT NULL)
--     CHECK (status = 'email_confirmed')
--
--   "Beneficiaries confirm own invite"
--     USING (invite_token IS NOT NULL AND status='pending')
--     CHECK (status='confirmed' AND invite_token = invite_token)  -- tautology
--
-- The USING clauses don't actually verify the calling client
-- knows the token — they only check that *a* token exists on the
-- row. Legitimate confirmation goes through the beneficiary-access
-- edge function which uses the service role and checks the token
-- properly. These client-side policies are vestigial and unsafe.
drop policy if exists "Beneficiaries can confirm via token" on public.beneficiaries;
drop policy if exists "Beneficiaries confirm own invite"   on public.beneficiaries;
