# Verifying Supabase RLS matches the schema files

The repo's `supabase/schema*.sql` files describe what RLS policies *should* be deployed. The dashboard is the ground truth. They have already drifted at least once (the missing `audit_log` INSERT policy). This is how to check the rest.

## Step 1 — dump every deployed policy

Open Supabase Dashboard → **SQL Editor** → **New query**, paste this, run it:

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual         as using_expr,
  with_check   as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;
```

Click **Download CSV** so you have a stable artifact to diff against. Each row is one policy:

| column | meaning |
|---|---|
| `tablename` | which table the policy is on |
| `policyname` | the policy's name (this is what `drop policy if exists "..."` references) |
| `cmd` | `SELECT` / `INSERT` / `UPDATE` / `DELETE` / `ALL` |
| `roles` | which Postgres roles it applies to (`{authenticated}`, `{anon}`, `{public}`, etc.) |
| `using_expr` | the `USING (...)` clause — controls read access |
| `check_expr` | the `WITH CHECK (...)` clause — controls write validity |

## Step 2 — confirm RLS is **enabled** on every public table

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Anything with `rowsecurity = false` is a hole — every row in that table is readable/writable by every authenticated user. The schema files turn RLS on everywhere; if the dashboard disagrees, that's a deployed bug.

## Step 3 — diff against the schema files

Use the dump from Step 1 to confirm, table by table, that:

1. **Every table named in the schema files has at least one matching policy in the dump.**
2. **No table has a policy *named* in the dump that isn't in any schema file** — that's drift from someone editing the dashboard directly. Either delete the policy or capture it in a new `supabase/migrations/*.sql` file.
3. **For every policy, the `using_expr` / `check_expr` from the dashboard matches what's in the SQL file.** Whitespace doesn't matter; logical structure does.

The highest-risk things to scrutinise:

| Table | What must be true |
|---|---|
| `profiles` | UPDATE `WITH CHECK` pins `plan`, `stripe_customer_id`, `stripe_subscription_id`, `plan_renewal`, `mfa_enrolled`, `mfa_email_fallback`, `switch_triggered_at`, `mfa_backup_email`. If any of these are missing from `check_expr`, users can self-upgrade their own plan. |
| `vault_entries` | All four verbs (SELECT/INSERT/UPDATE/DELETE) check `auth.uid() = user_id`. Also a "Partners can read/insert/update shared entries" set, gated on `is_shared = true` and an accepted `partner_link`. |
| `dependants` | The granular policies from `supabase/migrations/dependants-rls.sql`. The legacy `"Users can manage own dependants"` policy must **not** be present alongside them — PostgreSQL ORs permissive policies and the broad one would defeat the granular `second_parent_id` checks. |
| `notifications` | INSERT should **not** appear for `authenticated` — only service role inserts. |
| `partner_links` | UPDATE should be split into granular "accept" / "decline" / "sharing flag" policies, *not* one blanket policy. |
| `shared_links` | Trigger `verify_shared_link_ownership` exists (check Database → Triggers). |
| `separations` | INSERT for users is `WITH CHECK (false)` — only service role creates these. |
| `stripe_events` | A deny-all policy (`FOR ALL USING (false)`). Service role bypasses. |
| `audit_log` | SELECT for owner, INSERT for authenticated where `user_id = auth.uid()` (the one you just applied). |
| `webauthn_credentials`, `device_log`, `push_subscriptions`, `vault_documents`, `after_i_am_gone`, `vault_entry_versions`, `vault_recovery_codes`, `decoy_entries`, `checkin_log` | Owner-scoped via `auth.uid() = user_id`. |

## Step 4 — for each drift you find

- If the dashboard is *missing* a policy the SQL files define → re-apply that part of the SQL file in the SQL Editor.
- If the dashboard has an *extra* policy not in any SQL file → either capture it in a new `supabase/migrations/*.sql` (and reapply if needed) or drop it.
- If the dashboard policy *differs in expression* from the SQL file → decide which is correct, fix the other.

## Storage bucket policies (separate check)

Dashboard → **Storage** → click each bucket → **Policies** tab.

- `vault-files` — should be **private**. Policies should restrict access to paths starting with `${auth.uid()}/...`.
- Any `death-certificates` bucket — should be private, signed URLs only via service-role edge function.

## Edge function secrets (separate check)

Dashboard → **Settings** → **Edge Functions** → **Secrets**.

Confirm present:
- `ADDRESSNOW_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (auto-provisioned)
- Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
- Email provider key (Resend, etc.)
- VAPID private key (push notifications)

Confirm **none** of these names appear in `.env`, `.env.example`, or any `VITE_*` reference in the repo (`grep -r VITE_ src/`). The browser must never see these.
