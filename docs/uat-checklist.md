# Digital Relative — Manual UAT Checklist

Test against the live site (`https://digitalrelative.co.uk`) unless otherwise noted. Tick boxes as you go. Flag failures with the section number + a one-line repro.

Estimated effort: 6–8 hours for full coverage with edge-case probing.

---

## 1. Authentication

### Sign-up (email + password)
- [ ] Reach landing page → click **Sign up**
- [ ] Enter email + password, accept terms, submit → success toast appears
- [ ] Redirected to **Vault PIN setup**; enter PIN twice and confirm
- [ ] Redirected to **MFA setup** (skip if OAuth user); scan QR with authenticator, enter 6-digit code → "2FA enabled" toast
- [ ] Lands on dashboard
- [ ] **Double-click submit on signup** — verify button disables, no duplicate account created
- [ ] **Invalid email** (`test@`, `test@.com`) — verify validation error
- [ ] **Short password** (4 chars) — verify min-length error

### Sign-in (email + password)
- [ ] Click **Log in** → enter email + password → submit
- [ ] PIN entry prompt → enter PIN → MFA prompt → enter code → dashboard

### Sign-in (OAuth: Google / Apple)
- [ ] Click **Continue with Google** (or Apple) → complete provider flow
- [ ] MFA prompt is **skipped** for OAuth users
- [ ] Vault PIN setup runs on first OAuth login
- [ ] Lands on dashboard

### Password reset
- [ ] Click **Forgot password?** → enter email → "check your email" confirmation
- [ ] Receive email → click reset link → set new password → success
- [ ] Sign in with new password works

### Auth edge cases
- [ ] **Stale session redirect** — log in, wait for absolute 8h limit, navigate → redirected to login
- [ ] **Wrong PIN 5+ times** — verify lockout per `MAX_AUTH_ATTEMPTS = 5`
- [ ] **MFA code timing** — wait 30s after generating, submit → "Code expired"
- [ ] **OAuth then email conflict** — sign up Google with `x@y.com`, then try email signup with same address → conflict handled
- [ ] **Refresh during PIN entry** — restoreSessionKey logic at `App.jsx:55-61` should NOT flicker between states

---

## 2. Vault (`/vault`)

### Add entry
- [ ] Click **+ Add account** → modal opens
- [ ] Type "Barclays" in company search → dropdown shows logo + category
- [ ] Select Barclays → title and category autofill
- [ ] Enter username, password, notes; pick category → **Save** → entry appears
- [ ] Encrypted at rest — confirm by reading `vault_entries.username` in Supabase: ciphertext, not plaintext

### Edit + expiry
- [ ] Open existing entry → **Edit** → change password, set expiry 7 days out → save
- [ ] Verify list shows "Expires in 7d" red badge
- [ ] Set expiry to past date → "Expired" red badge
- [ ] Set expiry to 90 days → "Exp: <date>" green badge

### Category-specific fields
- [ ] Banking entry: sort code `20-00-00`, account number `12345678` → saves + renders
- [ ] Insurance entry: policy number, sum assured, renewal date → saves + renewal badge appears if <60d

### Sharing (see §4)

### CSV import
- [ ] Import Bitwarden CSV with 500 rows → format auto-detected (`ImportCSV.jsx:78-94`)
- [ ] Import with non-ASCII grouping (`Ñøño Bank`) → category-guessing doesn't break
- [ ] Import with null bytes / invalid UTF-8 → graceful failure, not a blank screen

### Vault edge cases
- [ ] **Empty title** — "Title is required" error
- [ ] **XSS in title** (`<script>alert(1)</script>`) — sanitised/rejected
- [ ] **5000-char notes** — textarea scrolls, layout intact
- [ ] **Network error mid-save** — error toast, draft retained in sessionStorage
- [ ] **Two-tab conflict** — open same entry in two tabs, save in tab 1 then tab 2 → last-write-wins or warning
- [ ] **Double-click save** — only one request fires
- [ ] **Vault locks mid-edit (30min inactivity)** — re-unlock, modal still open with draft restored
- [ ] **Password reveal across entries** — toggle reveal in entry A, switch to entry B → B's password not auto-revealed

---

## 3. Address lookup (component used in Family, Vault, After-I-Am-Gone)

### Search via AddressNow
- [ ] Add a vault entry of category Banking → Address section
- [ ] Type "22 Hanover Street, London" → dropdown appears after 2 chars
- [ ] Select a suggestion → Company / Street / Town / Postcode autofill
- [ ] Save entry → on reopen, address still parsed into the structured fields

### Container drill-down
- [ ] Search a building name with multiple flats → dropdown shows "X addresses ›"
- [ ] Click container → list of units appears
- [ ] Pick a unit → full address fills

### Business name handling
- [ ] Search for a business (e.g. "Grant McGregor Ltd, Edinburgh")
- [ ] Verify the company name lands in the **Business name** field, not Street
- [ ] Street holds "22 Hanover Street" (or similar premises+street line)
- [ ] Town = "Edinburgh", Postcode populated

### Manual entry fallback
- [ ] Click **Enter manually instead** → structured fields appear
- [ ] Fill all fields, save → entry persists

### Address lookup edge cases
- [ ] **Slow 3G** — verify lookup gracefully times out, doesn't lock UI
- [ ] **Rapid typing** — 5 chars in 500ms → only 1 API call (200ms debounce)
- [ ] **Postcode-only search** (`SW1A 1AA`) → results appear
- [ ] **Non-UK postcode** (`10001`) — filtered out (`Countries=GBR`)
- [ ] **Clear address mid-edit** → fields wipe, no stale data on next save

---

## 4. Shared links

### Create
- [ ] Open vault entry → **Share** → ShareModal opens
- [ ] Enter vault PIN → "Authenticate" → MFA prompt if enabled → configure step
- [ ] Set expiry "24h", uncheck "Include password", check "Notify on access"
- [ ] **Create link** → copy URL; format `https://digitalrelative.co.uk/share?t=...#key=...`

### Recipient view
- [ ] Open link in private/incognito window → SharedLinkPage renders
- [ ] Entry details visible, password masked if owner excluded it
- [ ] Owner receives notification (in-app + email) if "Notify on access" was set

### Expiry / one-time
- [ ] 1h-expiry link, open after 1h → "Link expired" error
- [ ] One-time link, open twice → second open shows "Link already accessed" or similar

### Sharing edge cases
- [ ] **Wrong PIN at auth step** → error toast, doesn't advance
- [ ] **Recipient PIN-protected link** → recipient prompted for the PIN owner set
- [ ] **XSS in notes** (`<img src=x onerror=alert(1)>`) → rendered escaped on recipient view
- [ ] **Network error during create** → error toast, can retry, state preserved
- [ ] **Recipient is signed in as a different user** → still able to decrypt (zero-knowledge, recipient's account is irrelevant)

---

## 5. Family (`/family`)

### Children
- [ ] **Add Child** → name + DOB → age auto-calculates → save
- [ ] Card shows: name, age, school, contact (sensitive fields masked)
- [ ] Edit card → change school → save → card updates
- [ ] Delete → confirm dialog → card removed

### Shared family info
- [ ] **Edit shared info** → fill GP, dentist → save → info card at top
- [ ] Info is visible across child/dependant/pet contexts (shared)

### Type tabs
- [ ] Children / Dependants / Pets tabs present
- [ ] Switch to Dependants → add a dependant → switch to Pets → add a cat → no cross-pollution
- [ ] Counts on tabs match: "Children (2)", "Pets (1)"

### Family edge cases
- [ ] **Empty name** → "Name is required" error
- [ ] **300-char name** → rejected or truncated to 200 (validation max)
- [ ] **Future DOB** → accepts (unborn) or rejects with clear guidance
- [ ] **Sensitive fields encrypted** — add a password for a dependant → masked as ●●●●●● on card
- [ ] **Draft survives lock** — fill form, vault locks, unlock → draft restored from sessionStorage
- [ ] **Passport expiry within 30 days** → warning badge appears
- [ ] **Second parent read** (`both_parents` access_control) — log in as partner → confirm visibility of the shared profile
- [ ] **Separation revokes second-parent read** — initiate separation → former partner can no longer see the profile

---

## 6. After I Am Gone (`/afteriamgone`)

### Owner view
- [ ] Sidebar → After I Am Gone → 6 guide sections render
- [ ] Tick a step → checkbox toggles, saved
- [ ] **Edit** a step's detail → textarea → save → text persists
- [ ] Progress bar reflects ticked %

### Beneficiary view (via portal)
- [ ] Beneficiary opens portal link → same sections render read-only (no Edit button)
- [ ] Ticks affect local view only, not owner's vault

### Edge cases
- [ ] **5000-char step detail** → textarea scrolls, no layout break
- [ ] **Save fails (network)** → error toast, can retry
- [ ] **Step with no detail** → renders cleanly, no "null" text

---

## 7. Billing (Stripe)

### Upgrade
- [ ] Landing page → click "Most popular" Single plan → £18/yr → checkout
- [ ] If unauthenticated, login flow first, then resumes checkout (pending-plan stashed in sessionStorage)
- [ ] Use test card `4242 4242 4242 4242`, future date, any CVC → success
- [ ] Redirect to `/?success=true`; toast appears; plan updated within 5s (PlanPage polls twice with 2s/5s delay)

### Downgrade
- [ ] As Single user → "Downgrade to Free" → confirm consequences modal
- [ ] Plan reverts; if vault exceeds Free limits, warning banner shows but existing entries remain readable

### Billing edge cases
- [ ] **Missing Stripe keys** in env → demo toast "Connect your Stripe keys", checkout disabled
- [ ] **Cancelled payment** → redirected to `/?cancelled=true`, "not been charged" toast
- [ ] **Server returns non-Stripe URL** → rejected (`PlanPage.jsx:68-70` validates `https://checkout.stripe.com/`)
- [ ] **Couples plan** — 2-vault feature listed correctly
- [ ] **Two-tab checkout** — Stripe prevents double-charge, UX still sensible

---

## 8. MFA + Vault PIN

### Vault PIN flow
- [ ] First login → PIN setup (6 digits + confirm)
- [ ] Next login → PIN entry → unlock
- [ ] 30min inactivity → vault locks → re-entry overlay
- [ ] 5 wrong PIN attempts → lockout / forced re-auth

### MFA setup
- [ ] Settings → 2FA → QR code → enter code → "MFA enabled"
- [ ] Recovery codes shown once → save them somewhere
- [ ] Refresh page → recovery codes do **not** reappear

### MFA edge cases
- [ ] Use a recovery code → "signed in with recovery code" banner → "Set up 2FA" button
- [ ] OAuth user → no MFA prompt (exempt per `AuthPage.jsx:179`)
- [ ] Browser refresh after PIN unlock → session key restored from sessionStorage, no re-prompt (within 30min)

### Trusted device (PRF biometric)
- [ ] PIN entry → tick "Trust this device" → unlock → Touch ID/Windows Hello prompt → approve
- [ ] Settings → trusted-device card shows "🔐 Biometric unlock"
- [ ] Sign out + sign back in → biometric prompt on PIN screen → approve → vault unlocks
- [ ] Settings → "Remove trust from this device" → next sign-in requires PIN
- [ ] **Legacy migration** — user with old trust scheme signs in with PIN → biometric prompt appears → approve → Settings card flips to PRF mode
- [ ] **User cancels biometric prompt** → migration deferred 24h, legacy scheme still works
- [ ] **Authenticator doesn't support PRF** → device flagged unsupported, no further prompts

### Security keys / passkeys
- [ ] Settings → "Set up security key" → name it → register
- [ ] Verify key listed in "Security keys and passkeys" with date added
- [ ] Sign out + sign in → security key prompt during MFA → approve → unlocks
- [ ] Remove a key → confirm → key gone from list

---

## 9. Mobile responsiveness

- [ ] **iPhone SE (320px)**: no horizontal scroll on any page
- [ ] **iPhone 14 (390px)**: vault cards stack, modals are bottom-sheet
- [ ] **iPad (1024px)**: 2-column grid, sidebar visible
- [ ] **Touch targets**: all buttons ≥44px tall
- [ ] **Input font ≥16px** to prevent iOS auto-zoom on focus
- [ ] **Landscape rotation**: no layout thrash; modal still usable with keyboard up
- [ ] **200% browser text size** → no overflow inside modals

---

## 10. Error handling

### Network offline
- [ ] DevTools → Network → Offline
- [ ] Add vault entry → error toast appears, draft preserved
- [ ] Re-enable network → retry succeeds

### Supabase outage simulation
- [ ] Block requests to `*.supabase.co` in DevTools
- [ ] Login → error message (not blank page)
- [ ] Vault fetch → empty state with error banner (not infinite spinner)

### Logout mid-operation
- [ ] Start typing a new entry, click logout before save → logout completes, redirected to landing
- [ ] Log back in → entry not present (or draft visible in sessionStorage if UI supports recovery)

### Concurrent edits
- [ ] Same vault entry in 2 tabs → save in tab 1 → save in tab 2 → last write wins or conflict toast

---

## 11. Code-level "looks suspect" — please confirm by behaviour

These were flagged by static analysis; verify in the browser.

- [ ] `FamilyPage.jsx:58` was a `useState` initializer with side effects, now fixed to `useEffect`. Verify: drafts actually restore on mount after vault re-lock.
- [ ] `ShareModal.jsx:64` uses `useRef` for plaintext. Verify: share 10 entries back-to-back, no memory bloat in DevTools Memory profile.
- [ ] `VaultPinEntry.jsx:99` references `unenrollCode` (undefined). Wrapped in try/catch so silently fails — duress-PIN check is therefore currently broken. To verify: set a duress PIN, enter it on next sign-in → should activate decoy vault but won't. (Latent bug; not yet fixed.)
- [ ] PRF migration on Safari macOS — fire-and-forget timing may collide with strict transient-activation. If `NotAllowedError` shows in console after PIN entry, this needs to be `await`-ed before `onUnlocked()`.

---

## 12. End-to-end happy-path scenarios

### Scenario A — new user, full setup
- [ ] Sign up with email/password
- [ ] Set vault PIN
- [ ] Set up 2FA + save recovery codes
- [ ] Add 3 vault entries (banking, insurance, social)
- [ ] Add 1 beneficiary (spouse, full access)
- [ ] Share one entry via link, copy URL
- [ ] Add 2 children to Family page
- [ ] Check in (Dashboard)
- [ ] Upgrade to Single plan via Stripe test card
- [ ] Logout + login → all data still there

### Scenario B — beneficiary access
- [ ] Receive shared link as email
- [ ] Open in incognito window
- [ ] View entry → details correct, password hidden if owner excluded
- [ ] Wait for expiry → revisit → "expired" error

### Scenario C — emergency access (executor flow)
- [ ] Set executor beneficiary
- [ ] Executor opens emergency-access portal → uploads death certificate
- [ ] Admin reviews + approves
- [ ] After hold period, executor receives vault access
- [ ] Vault contents readable per access tier configured
