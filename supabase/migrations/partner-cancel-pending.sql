-- ══════════════════════════════════════════════════════════════
-- partner_links — let requester cancel a pending invite
-- ──────────────────────────────────────────────────────────────
-- The granular UPDATE policies added in round 5 let the partner
-- accept/decline an invite (when status='pending') and let either
-- party flip their own sharing flag (when status='accepted'), but
-- there's no policy that lets the REQUESTER withdraw a pending
-- invite they themselves sent.
--
-- Symptom: in CouplesPage the "Waiting for your partner to accept"
-- card has no Cancel button — the requester is stuck waiting until
-- the partner acts.
--
-- Fix: allow the requester to transition status 'pending' →
-- 'unlinked' on their own row. couples_payer_id / invite_code /
-- accepted_at remain immutable via the protect_partner_link_fields
-- trigger.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════

drop policy if exists "Requester can cancel pending invite" on public.partner_links;
create policy "Requester can cancel pending invite" on public.partner_links
  for update
  using (auth.uid() = requester_id and status = 'pending')
  with check (
    auth.uid() = requester_id
    and status = 'unlinked'
  );
