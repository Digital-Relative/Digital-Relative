-- ══════════════════════════════════════════════════════════════
-- audit_log INSERT policy (idempotent, standalone)
-- ──────────────────────────────────────────────────────────────
-- The client inserts its own audit-log events (sign-in,
-- vault_entry_*, beneficiary_*, checked_in) via
-- supabase.from('audit_log').insert(...) using the authenticated
-- user's JWT. Without this policy those inserts are silently
-- denied by RLS — the .catch logging added in AuthContext.jsx:153
-- and friends will report "new row violates row-level security
-- policy" errors.
--
-- WITH CHECK ensures a user can only attribute events to themselves.
-- Service-role inserts from edge functions bypass RLS and are
-- unaffected.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════

alter table public.audit_log enable row level security;

drop policy if exists "Users can insert own audit log" on public.audit_log;
create policy "Users can insert own audit log" on public.audit_log
  for insert
  to authenticated
  with check (auth.uid() = user_id);
