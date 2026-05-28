# CLAUDE.md

Context for future Claude Code sessions working on this project.

> **Note on conversation history**: The main thread of design decisions, debugging history, and product reasoning lives in the user's Claude.ai chat session — not in this file or in git. If something here is ambiguous, ask Dan for the relevant chat excerpt rather than guessing.

---

## What this is

**Digital Relative** — a secure UK digital legacy vault SaaS. Lets users store sensitive information (accounts, documents, wishes, credentials, etc.) and release it to nominated beneficiaries on death or incapacity, with identity verification and check-in workflows.

Currently at **v105**.

## Local path

```
C:\users\danta\legatum
```

Project root contains: `src/`, `public/`, `supabase/`, `dist/`, `deploy.ps1`, `vercel.json`, `vite.config.js`, `package.json`.

## Tech stack

- **Frontend**: React 19.2 + Vite 8, React Router 7, react-hot-toast, lucide-react, papaparse
- **Backend / DB / auth**: Supabase (Postgres, Auth, Storage, RLS)
- **Edge functions**: Supabase Edge Functions (Deno runtime)
- **Payments**: Stripe (`@stripe/stripe-js` 9.6) — Checkout + Billing Portal
- **Transactional email**: Resend (via `_shared/resend.ts`)
- **SMS**: provider wired via `_shared/sms.ts`
- **Hosting**: Vercel (auto-deploys on git push to the connected branch)

## Supabase project

- **Project ref**: `xqmgfyfqeehjvjxbezgx`
- **Region**: EU London (eu-west-2)
- Dashboard: https://supabase.com/dashboard/project/xqmgfyfqeehjvjxbezgx

## Edge functions

Located in `supabase/functions/`. Shared helpers in `_shared/` (`emails.ts`, `resend.ts`, `sms.ts`). Current deployed functions:

| Function | Purpose |
|---|---|
| `addressnow-proxy` | Proxy for AddressNow / UK postal address lookup |
| `beneficiary-access` | Beneficiary-side access to released content |
| `checkin-scheduler` | Periodic check-in prompts / dead-man's-switch scheduling |
| `couples-accept` | Accept a couples / shared-account invitation |
| `couples-invite` | Send a couples / shared-account invitation |
| `create-checkout` | Create Stripe Checkout session |
| `create-portal` | Create Stripe Billing Portal session |
| `cron-finalize-separations` | Scheduled finalization of pending separations |
| `delete-account` | Account deletion + data purge |
| `device-log` | Trusted device logging |
| `duress-alert` | Duress / panic alert handling |
| `emergency-access` | Emergency access request flow |
| `finalize-separation` | Finalize a separation event |
| `handle-separation` | Handle an in-progress separation |
| `mfa-email` | Email-based MFA code delivery |
| `push-notification` | Push notifications |
| `send-beneficiary-invite` | Invite a beneficiary |
| `shared-link-access` | Access to shared-link content |
| `stripe-webhook` | Stripe webhook receiver |
| `verify-identity` | Identity verification flow |
| `webauthn` | WebAuthn / passkey registration & assertion |

> The original brief said "17 functions" — actual deployed count is the list above (22). Treat this table as the source of truth.

## Deployment

### Frontend (Vercel)

Vercel is wired up to auto-deploy on `git push`. The repo also has a helper script:

```powershell
./deploy.ps1
```

Run from the project root. Use this for the standard frontend release flow.

### Edge functions (Supabase)

Deploy individually by name:

```powershell
supabase functions deploy <function-name>
```

Examples:

```powershell
supabase functions deploy stripe-webhook
supabase functions deploy webauthn
```

Functions are **not** auto-deployed on git push — they must be deployed explicitly with the Supabase CLI against project ref `xqmgfyfqeehjvjxbezgx`.

## Known open issues

1. **Address field mapping** — fields coming back from AddressNow / `addressnow-proxy` aren't mapping cleanly into the form's address state. Some lines land in the wrong slots (line 2 vs. city vs. county). Needs a normalization layer between the proxy response and the form.

2. **Modal persistence on tab switch** — modal open/dismissed state isn't preserved when the user switches browser tabs and returns. Likely a state-reset on focus/visibility change. Affects UX in long forms where the user references another tab mid-flow.

3. **WebAuthn PRF trusted device** — the WebAuthn PRF (pseudo-random function) extension flow for marking a device as trusted is not yet reliable. Affects the trusted-device path; non-PRF passkeys still work for auth, but the PRF-derived secret used for trusted-device material isn't being persisted/retrieved correctly across all browser/authenticator combinations.

## Conventions / things to know

- Frontend lives in `src/`. Build output in `dist/`.
- All secrets (Supabase service role, Stripe, Resend, etc.) are configured as Supabase function secrets and Vercel env vars — **never** check secrets into the repo.
- UK-specific: data residency is EU London; addresses use AddressNow (UK postal); SMS/email copy uses UK conventions.
- RLS is the primary auth boundary on the DB — assume every table has policies and check them before adding new queries.

## When in doubt

Ask Dan. The Claude.ai chat session has the running context for product decisions, in-flight debugging, and the "why" behind choices that aren't obvious from the code alone.

## Conversation history & session handoff

The full conversation history — all technical decisions, security audit findings, bug fixes, and code changes — is stored in the Claude.ai chat, not in this repo or git. When starting a new session:

- Ask the user to paste in any relevant context from that chat, or
- Check `/mnt/transcripts/` if running in the Claude.ai environment.

### Key files changed in recent sessions

- `src/components/AddressLookup.jsx`
- `src/pages/BeneficiariesPage.jsx`
- `src/pages/VaultPage.jsx`
- `src/lib/crypto.js`
- `src/App.jsx`
- `src/context/AuthContext.jsx`

### Key security fixes applied

- 14 rounds of security audits — all resolved.
- TDZ (temporal dead zone) fixes in `VaultPage` and `BeneficiariesPage`.
- `sessionStorage` key persistence for the vault across page navigations.

### Outstanding

- Address field mapping from the AddressNow API still needs verifying.
- Modal persistence on tab switch needs testing after the latest deploy.
