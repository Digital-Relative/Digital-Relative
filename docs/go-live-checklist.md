# Go-Live Checklist

Everything that needs to be true before flipping `digitalrelative.co.uk` from test mode to live mode. Tick each one as you complete it.

Test and live environments are **separate** for Stripe, Supabase (if you have two projects), and Vercel env vars. Settings in test do **not** carry over.

---

## 1. Stripe — Live mode configuration

The Customer Portal config and all webhooks are separate between test and live modes. Open the Stripe Dashboard, switch to **Live mode** (top-left toggle), and configure each section below in the live environment.

### Customer Portal (`Settings → Billing → Customer portal`)
- [ ] **Cancel subscriptions** → set behaviour to **"At end of billing period"** (matches modal copy "you keep access until renewal date")
- [ ] **Update subscriptions** → ensure all three plans listed: Single — Annual £18, Couples — Annual £45, Couples — Monthly £5
- [ ] **Update subscriptions → When customers change plans or quantities** → **"Prorate charges and credits"**
- [ ] **Update subscriptions → Charge timing** → "Invoice prorations immediately"
- [ ] **Update subscriptions → Downgrades** → both rows ("Switching to cheaper plan" and "Switching to shorter interval") set to **"Wait until end of billing period to update"**
- [ ] **Subscriptions and emails → Customer emails** → enable "Send emails about upcoming renewals" (reduces dispute volume)
- [ ] Use the **Preview** button (top right) to walk through what your customers will see. Verify the cancel + downgrade flows match the copy in the app's modal.

### Branding (`Settings → Branding`)
- [ ] Upload logo (PNG, ~512x512)
- [ ] Set brand colour to match the gold accent (`#C9A84C` or whatever's current)
- [ ] Set the company name, support email, support URL — these appear on receipts and the portal

### Products & prices (`Products`)
- [ ] Recreate Single — Annual £18 in live mode
- [ ] Recreate Couples — Annual £45 in live mode
- [ ] Recreate Couples — Monthly £5 in live mode
- [ ] Copy the live `price_…` IDs and update `src/lib/stripe.js` (or the env vars `VITE_STRIPE_PRICE_*` if it's env-driven) — the test price IDs will not work in live mode

### Webhooks (`Developers → Webhooks`)
- [ ] Create a webhook endpoint pointing at `https://xqmgfyfqeehjvjxbezgx.functions.supabase.co/stripe-webhook` (live project URL)
- [ ] Select events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`
- [ ] Copy the signing secret (starts with `whsec_…`) into the Supabase Edge Function secret `STRIPE_WEBHOOK_SECRET` (live project)
- [ ] Use the **"Send test webhook"** button to verify your function returns 200

### API keys
- [ ] Copy the live publishable key (`pk_live_…`) into Vercel env `VITE_STRIPE_PUBLISHABLE_KEY` for the production deployment
- [ ] Copy the live secret key (`sk_live_…`) into Supabase Edge Function secret `STRIPE_SECRET_KEY` (live project)
- [ ] **Never** put `sk_live_…` in any `VITE_*` env var or in client code — it must only live server-side

---

## 2. Supabase — Live project (or live-mode of the same project)

### Apply every SQL migration in order
Each file in `supabase/migrations/` is idempotent. Either apply them via the SQL Editor or use the Supabase CLI to push.

- [ ] `supabase/schema.sql` (initial schema, if this is a fresh project)
- [ ] `supabase/schema-security-additions.sql`
- [ ] `supabase/schema-security-round4.sql`
- [ ] `supabase/schema-security-round5.sql`
- [ ] `supabase/schema-security-round6.sql` (already contains all the round-6 migrations appended)

Or apply them piecemeal in this order:
- [ ] `audit-log-insert-policy.sql`
- [ ] `dependants-rls.sql`
- [ ] `profiles-allow-mfa-state.sql`
- [ ] `partner-cancel-pending.sql`
- [ ] `partner-invite-email.sql`
- [ ] `rls-drift-fix.sql`
- [ ] `separation-grace-period.sql`
- [ ] `partners-view-profile.sql`

### Verify RLS using `docs/rls-dashboard-check.md`
- [ ] Dump deployed policies with the `pg_policies` query
- [ ] Diff each table against the schema files — no missing policies, no orphaned policies, no expressions that differ from the SQL files
- [ ] Confirm every public table has `rowsecurity = true`
- [ ] Confirm `mfa_email_codes` and `webauthn_challenges` exist with RLS on (deny-all default is correct for these)

### Storage buckets (`Storage → Buckets`)
- [ ] `vault-files` bucket exists and is **private**
- [ ] `death-certificates` bucket exists and is **private**, signed URLs only (used by the admin review flow)
- [ ] Bucket policies restrict path access to `${auth.uid()}/...` for `vault-files`

### Edge function secrets (`Settings → Edge Functions → Secrets`)
All of these need to be set in the live project:
- [ ] `STRIPE_SECRET_KEY` — `sk_live_…`
- [ ] `STRIPE_WEBHOOK_SECRET` — `whsec_…` from the live webhook you created
- [ ] `ADDRESSNOW_KEY` — your AddressNow API key, **domain-restricted** to `digitalrelative.co.uk` in the AddressNow dashboard
- [ ] `RESEND_API_KEY` (or whichever email provider you use)
- [ ] `VAPID_PRIVATE_KEY` (for web push)
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — auto-provisioned, verify they're set
- [ ] Search `grep -r VITE_ src/` and confirm **none** of the names above appear with a `VITE_` prefix — those would ship to the browser

### Deploy every edge function
```
supabase functions deploy addressnow-proxy
supabase functions deploy beneficiary-access
supabase functions deploy checkin-scheduler
supabase functions deploy couples-accept
supabase functions deploy couples-invite
supabase functions deploy create-checkout
supabase functions deploy create-portal
supabase functions deploy delete-account
supabase functions deploy device-log
supabase functions deploy duress-alert
supabase functions deploy emergency-access
supabase functions deploy finalize-separation
supabase functions deploy handle-separation
supabase functions deploy mfa-email
supabase functions deploy push-notification
supabase functions deploy send-beneficiary-invite
supabase functions deploy shared-link-access
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy verify-identity
supabase functions deploy webauthn
```
- [ ] All deployed; verify each returns 200/401 (not 500/404) on a smoke ping

### Auth settings (`Authentication → Providers`)
- [ ] Email/password enabled
- [ ] **Confirm email** required (Auth → Email auth settings)
- [ ] Google OAuth: live client ID + secret configured, redirect URL set to `https://digitalrelative.co.uk/auth/callback` (or your live equivalent)
- [ ] Apple OAuth: same — live credentials, live redirect URL

### Realtime (`Database → Replication`)
- [ ] Realtime is **disabled** for: `stripe_events`, `rate_limits`, `audit_log` (per `schema-security-additions.sql:103`)

---

## 3. Vercel — Production deployment

### Environment variables
Set these for the **Production** environment specifically (separate from Preview):
- [ ] `VITE_SUPABASE_URL` — live project URL
- [ ] `VITE_SUPABASE_ANON_KEY` — live anon key
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` — `pk_live_…`
- [ ] `VITE_VAPID_PUBLIC_KEY` — matches the private key set in Supabase
- [ ] `VITE_CRISP_WEBSITE_ID` — your live Crisp ID
- [ ] **Remove** `VITE_ADDRESSNOW_KEY` if it's still there — the key now lives in Supabase as `ADDRESSNOW_KEY` (server-side, never exposed to browser)

### Domain + SSL
- [ ] `digitalrelative.co.uk` and `www.digitalrelative.co.uk` both point at the Vercel deployment
- [ ] SSL certificate issued and renewing automatically (Vercel handles this)
- [ ] 308 redirect from apex to `www` (or vice versa) — already in place per current setup

### Preview deployments
- [ ] Disable preview deployments OR password-protect them (Vercel project settings → Deployment Protection). You don't want `legatum-chi.vercel.app/feature-branch-…` showing test data publicly.

---

## 4. AddressNow (Loqate)

- [ ] In the AddressNow dashboard, find your API key
- [ ] **Restrict its domain** to `digitalrelative.co.uk` and `www.digitalrelative.co.uk` only — without this, an attacker who lifts the key (e.g. from logs) can spend your AddressNow quota
- [ ] Even though the key is now server-side via the `addressnow-proxy` edge function, domain restriction is defence in depth

---

## 5. Testing before announcement

### Run the UAT checklist
- [ ] Work through `docs/uat-checklist.md` end to end against `digitalrelative.co.uk`
- [ ] Pay particular attention to: signup → email confirm → MFA setup → vault PIN → vault unlock, on both email/password and Google OAuth

### Smoke-test the real-money paths
- [ ] In live mode, sign up as yourself, buy Single annual with your real card
- [ ] Verify the receipt email arrives
- [ ] Refund yourself from the Stripe dashboard → verify your profile flips back to free
- [ ] Sign up a second account, send a Couples invite, accept, verify profile updates to Couples
- [ ] Trigger an Unlink, watch the 14-day grace-period banner appear
- [ ] Manually set `separation_deadline` to a past timestamp in the dashboard, refresh the page, verify finalize-separation fires and the link unlinks

### Browser / device coverage
- [ ] Chrome desktop
- [ ] Edge desktop (you've been using this)
- [ ] Safari macOS (PRF biometric trust + transient activation — see `docs/uat-checklist.md` section 11)
- [ ] Firefox desktop (lower priority — fall-back path only)
- [ ] iOS Safari on phone
- [ ] Android Chrome on phone

### Trusted device + duress
- [ ] On at least one device with PRF support (modern Touch ID Mac, recent Windows Hello), verify the biometric upgrade flow works
- [ ] On at least one device without PRF, verify the legacy fallback works and the `dr_prf_unsupported` flag is set
- [ ] Confirm duress PIN entry shows decoy vault + fires the `duress-alert` function in the Network tab

---

## 6. Monitoring & observability

- [ ] Sentry (or similar) project created and DSN added to the build — catch client-side errors
- [ ] Supabase Logs dashboard bookmarked for edge function errors
- [ ] Stripe Dashboard → Webhooks → Events tab bookmarked — verify webhooks aren't piling up as "Failed"
- [ ] Console error alerts: after going live, watch for `[audit_log] insert failed:` in your error tracking — should be silent once the policy is correctly applied
- [ ] Uptime monitor (BetterUptime / UptimeRobot / Vercel itself) configured to ping the homepage every 5 min

---

## 7. Legal & compliance (don't skip)

- [ ] Privacy policy live at `/privacy` and links present in the footer
- [ ] Terms of service live at `/terms`
- [ ] Cookie banner / GDPR consent UI (you're EU-based and store sensitive data — required)
- [ ] Data processing agreement with Supabase reviewed (they offer one as a paying customer)
- [ ] Data processing agreement with Stripe reviewed
- [ ] Security disclosure email published (e.g. `security@digitalrelative.co.uk`) in the footer
- [ ] Contact email actually monitored

---

## 8. Operational readiness

- [ ] Supabase database backup retention configured (Settings → Database → Backups)
- [ ] You know how to restore from a backup if needed
- [ ] Customer support inbox set up (Crisp is already wired in)
- [ ] Incident response plan documented — what do you do if your Supabase project goes down, or if there's a data breach, or if Stripe locks the account
- [ ] At least one trusted second person has access to the Supabase, Stripe and Vercel dashboards (so a single account compromise can't lock you out)

---

## 9. Final pre-launch sweep

- [ ] All TODOs from this checklist ticked
- [ ] `npm audit` shows zero vulnerabilities (`deploy.ps1` already runs this on every push)
- [ ] No `console.log` debug calls left in the bundle (the `dr_prf_*` localStorage diagnostic I added during debugging is fine — it's not in the code, only as a one-liner you paste)
- [ ] No test data in the production database
- [ ] You can sign up, set everything up, and sign out without any visible error
- [ ] You've sent yourself the welcome email and beneficiary invite to confirm they look right

---

## Known gaps / follow-ups (won't block launch but worth a milestone)

- Nightly cron for `finalize-separation` (currently only fires when a partner opens the Couples page after deadline)
- Stripe webhook → automatic `handle-separation` trigger when a Couples-payer's plan changes via the portal (currently the user has to click Unlink manually)
- Mac/Safari PRF verification (was deferred because no Mac was available during dev)
- Bundle-size code-splitting (922 kB → 242 kB gzipped, fine for desktop, slow on poor mobile connections)
- Column-restricted view for partner profile reads (current RLS exposes the full `profiles` row including `stripe_*` to the linked partner)
