-- ══════════════════════════════════════════════════════════════
-- Dependants table — current RLS policies (idempotent)
-- ──────────────────────────────────────────────────────────────
-- Captures the post-round-5 / post-round-6 intended state.
--   * Owner has full CRUD via four granular policies.
--   * Second parent gets read-only access to a dependant when
--       access_control = 'both_parents'
--       AND there is still an accepted partner_link between the
--       two parents (so access expires on separation).
--   * second_parent_id may only be set/changed by the service
--     role via an edge function (client INSERT must leave it null,
--     client UPDATE must not change it).
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════

alter table public.dependants enable row level security;

-- Drop any broader legacy policies first so they cannot OR with the
-- granular ones below (PostgreSQL OR's overlapping permissive policies).
drop policy if exists "Users can manage own dependants"       on public.dependants;
drop policy if exists "Second parent can read child profiles" on public.dependants;

-- ── Owner CRUD ──────────────────────────────────────────────

drop policy if exists "Users can select own dependants" on public.dependants;
create policy "Users can select own dependants" on public.dependants
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own dependants" on public.dependants;
create policy "Users can insert own dependants" on public.dependants
  for insert with check (
    auth.uid() = user_id
    and second_parent_id is null  -- service role sets this via edge function
  );

drop policy if exists "Users can update own dependants" on public.dependants;
create policy "Users can update own dependants" on public.dependants
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    -- second_parent_id must remain unchanged; only the service role
    -- (via an edge function) may set or alter it.
    and second_parent_id is not distinct from (
      select second_parent_id from public.dependants d where d.id = dependants.id
    )
  );

drop policy if exists "Users can delete own dependants" on public.dependants;
create policy "Users can delete own dependants" on public.dependants
  for delete using (auth.uid() = user_id);

-- ── Second parent read access ───────────────────────────────
-- Gated on a still-accepted partner_link so access ends on separation.

drop policy if exists "Second parent can read child profiles" on public.dependants;
create policy "Second parent can read child profiles" on public.dependants
  for select using (
    access_control   = 'both_parents'
    and second_parent_id = auth.uid()
    and exists (
      select 1 from public.partner_links
      where (
        (requester_id = user_id and partner_id     = auth.uid()) or
        (partner_id   = user_id and requester_id = auth.uid())
      )
      and status = 'accepted'
    )
  );
