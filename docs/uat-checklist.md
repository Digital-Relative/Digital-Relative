# Digital Relative — Manual UAT Checklist

Test against the live site (`https://digitalrelative.co.uk`) unless otherwise noted. Tick boxes as you go. Flag failures with the section number + a one-line repro.

Estimated effort: 8–10 hours for full coverage with edge-case probing.

**Last refreshed:** 2026-05-26 — covers PRF trusted-device, Couples accept/cancel/resend, 14-day separation grace period, downgrade billing modal, AddressNow proxy, decoy decrypt fix, audit-log RLS, partner profile RLS.

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

---

## 13. AddressNow proxy (added 2026-05-26)

### Happy path — server-side key
- [ ] On any address-lookup field (Family, Vault, After-I-Am-Gone), type "22 Hanover Street" → dropdown appears
- [ ] DevTools → Network: confirm the request goes to `…supabase.co/functions/v1/addressnow-proxy`, **not** directly to `api.addressnow.co.uk` — and no `Key=` parameter is visible in the URL
- [ ] Source view of the bundle (`view-source:` or DevTools → Sources): grep for "addressnow" — should appear only as `'addressnow-proxy'`, never as a hard-coded API key

### Business name parsing
- [ ] Search a UK business (e.g. "Grant McGregor Ltd, Edinburgh") → select a result
- [ ] **Business name field** populates with the company
- [ ] **Street address** populates with "22 Hanover Street" (or equivalent)
- [ ] **Town** populates correctly
- [ ] **Postcode** populates correctly
- [ ] Save the entry, reopen → all fields persist with the same values

### Edge cases
- [ ] Search a residential address (no company) → Business name stays empty, other fields populate
- [ ] Search a building with multiple flats → drill-down (container) → individual unit selectable
- [ ] Quick consecutive keystrokes → only one debounced API call (200ms)
- [ ] Type "SW1A 1AA" (postcode-only) → results appear
- [ ] Block the proxy in Network tab → graceful fallback to manual entry (no broken UI)

---

## 14. PRF biometric trusted device (added 2026-05-26)

### New-user opt-in (supported authenticator)
- [ ] Sign in on a device with PRF support (modern Touch ID Mac, Windows Hello on TPM 2.0 + Chrome/Edge 116+)
- [ ] On the PIN screen, tick "Trust this device", enter PIN
- [ ] OS biometric prompt appears (Touch ID / Windows Hello)
- [ ] Approve → toast "Upgraded to biometric unlock"
- [ ] Settings → Trusted device card shows **green** "🔐 Biometric unlock"
- [ ] Sign out, sign back in → biometric prompt on PIN screen → approve → vault auto-unlocks

### Legacy → PRF migration
- [ ] Set up trust the old way (legacy localStorage scheme) — sign out + sign in once without PRF support
- [ ] Sign back in on a PRF-capable browser → after PIN entry, biometric prompt appears for migration
- [ ] Approve → toast "Upgraded to biometric unlock", legacy ciphertext removed from localStorage
- [ ] Verify: DevTools → Console: `Object.keys(localStorage).filter(k => k.startsWith('dr_'))` shows `dr_prf_cred:…` + `dr_prf_pin:…`, no `dr_trusted_pin:…`

### Unsupported authenticator
- [ ] On a browser/device without PRF (older Edge, Linux Firefox), attempt the migration
- [ ] Credential creation prompt may appear → after dismiss or completion, the `dr_prf_unsupported = true` flag should be set in localStorage
- [ ] Subsequent PIN entries do **not** re-prompt for biometric
- [ ] Settings → Trusted device card shows **gold** "⚠️ Device-token unlock (legacy)"

### Deferral after cancel
- [ ] PIN entry → biometric prompt appears → **cancel** the prompt
- [ ] Confirm `dr_prf_defer:<userId>` is set to a timestamp ~24h ahead
- [ ] Next sign-in within 24h: no biometric prompt
- [ ] After the deferral expires (manually edit the timestamp in DevTools): biometric prompt reappears

### Revocation
- [ ] Settings → Trusted device → Remove trust from this device
- [ ] Confirm all `dr_*` PRF localStorage entries cleared
- [ ] Sign out + sign in → PIN required, no biometric prompt

---

## 15. Duress PIN flow (fixed 2026-05-26)

- [ ] Settings → Duress PIN → set a 6-digit duress PIN
- [ ] Add a few decoy entries to populate the decoy vault
- [ ] Sign out
- [ ] Sign back in, enter your **duress** PIN
- [ ] Vault unlocks → decoy entries visible **with readable titles AND decrypted usernames/passwords/notes** (no base64 ciphertext)
- [ ] DevTools → Network: `duress-alert` edge function call fires (status 200)
- [ ] DevTools → Application → sessionStorage: `dr_duress_active = '1'`
- [ ] Real vault entries are **not** visible
- [ ] Sign out + sign in with **real** PIN → real vault appears, decoy entries hidden

### Trusted-device interaction
- [ ] With duress PIN configured, sign in: auto-unlock is **disabled** (no biometric prompt on page load)
- [ ] PIN form appears every sign-in — this is by design so duress is always a valid escape

---

## 16. Couples plan end-to-end (extensive changes 2026-05-26)

### Invite (account A, requester)
- [ ] A is on Couples plan, no active partner
- [ ] Couples vault page → "Invite partner" → enter B's email → Send
- [ ] If B already has an account: A sees "Waiting for partner to accept" card with **Cancel invite** and **Resend invite** buttons
- [ ] If B does not have an account: A sees "Invite sent to … — they'll receive an email"

### Cancel invite (account A)
- [ ] On the pending card, click **Cancel invite** → confirm → toast "Invite cancelled"
- [ ] Partner_links row goes to `unlinked` (verify in Supabase)
- [ ] UI flips back to "Invite partner" empty state

### Resend invite (account A, fresh invite only)
- [ ] Send a new invite (after `partner-invite-email.sql` migration applied)
- [ ] On the pending card, click **Resend invite** → toast "Invite resent"
- [ ] Partner B receives a new email + new in-app notification
- [ ] Resend on a pre-migration invite (`invite_email` null) → toast "Original email not on file — please cancel and re-invite"

### Accept (account B)
- [ ] B has free plan, receives invite email + in-app notification
- [ ] B signs in → notification visible → click → lands on Couples page
- [ ] B clicks **Accept** → no Stripe checkout prompted
- [ ] B's `profile.plan` → `'couples'` (verify in Supabase)
- [ ] `partner_links.couples_payer_id` → set to A's id (verify in Supabase)
- [ ] If B had an active Single subscription: Stripe sub cancelled, refund row appears in `refunds` table with `reason='couples_acceptance'`
- [ ] B sees the active Couples vault UI with partner card showing A's name

### Active link — both users
- [ ] Each user sees the partner's full name on the partner card (RLS partners-view-profile working)
- [ ] Sharing toggle: turn on → partner sees your private vault read-only
- [ ] Sharing toggle: turn off → partner sees "vault private"
- [ ] Shared vault tab: + Add button visible top-right, count visible
- [ ] Create a shared entry from A → B sees it
- [ ] Create a shared entry from B → A sees it
- [ ] Partner's vault tab: shared entries from the other user with "🔐 PIN required" badge on those with stored passwords

### Separation grace period — initiation (account A)
- [ ] Couples page → Unlink → confirm modal → toast "Separation started"
- [ ] Page shows red banner: "Couples plan ending in 14 days"
- [ ] A's `partner_links.status` → `'separation_pending'`, `separation_deadline` ≈ now+14d
- [ ] B receives in-app notification "Your Couples plan is ending"

### Separation grace period — review (both users)
- [ ] Click **Review shared entries** button on the banner
- [ ] Modal shows only entries the current user created (others not visible)
- [ ] Each entry: Keep / Discard buttons → click each, choices persist
- [ ] Close + reopen modal → choices retained
- [ ] B does the same review for their own entries
- [ ] Both users still have read access to all shared entries during the grace period (vault still works)

### Separation grace period — finalize
- [ ] In Supabase, manually update `partner_links.separation_deadline` to a past timestamp (e.g. `now() - interval '1 minute'`)
- [ ] Refresh the Couples page → toast "Couples link finalized…"
- [ ] `partner_links.status` → `'unlinked'`
- [ ] Entries marked Keep → `is_shared = false`, `partner_link_id = null`, still in owner's vault
- [ ] Entries marked Discard → deleted entirely
- [ ] Entries with no choice → kept (default)
- [ ] Non-payer's `profile.plan` → `'free'`, `stripe_*` cleared
- [ ] Non-payer had paid Single sub before → refund issued, row in `refunds` table with `reason='couples_separation'`
- [ ] Both users receive in-app notification "Couples vault unlinked"
- [ ] After finalize: A sees no link → invite UI; B sees no link → upgrade prompt

---

## 17. Plan management — downgrade modal (added 2026-05-26)

### Couples → Single
- [ ] On the Plan page (currently Couples), Single card button reads **"Downgrade to Single"** (not "Upgrade")
- [ ] Click → modal opens, title "Switch to Single?"
- [ ] Modal shows the renewal date pulled from `profile.plan_renewal` (e.g. "15 August 2026")
- [ ] Modal "What happens with your billing" section explains the plan switches at renewal, no immediate change, no double-charge, no cash refund
- [ ] If A has active partner link, gold-bordered "Your partner is affected" warning shows, pointing to the Couples → Unlink button
- [ ] Click "Switch to Single →" → opens Stripe billing portal
- [ ] In Stripe portal: select Single annual → confirm
- [ ] Stripe shows scheduled change at renewal date (NOT immediate, NOT a new £18 charge)
- [ ] Return to Plan page → "Current plan" badge still on Couples until renewal

### Couples or Single → Free (cancel)
- [ ] Free card button reads **"Downgrade to Free"**
- [ ] Click → modal title "Cancel your subscription?"
- [ ] Modal "What happens with your billing" explains access continues until renewal then auto-Free, no refund
- [ ] Click "Cancel subscription →" → opens Stripe portal
- [ ] Cancel in portal → returns to Plan page
- [ ] `profile.plan_renewal` still set, `stripe_subscription_id` marked for cancellation
- [ ] On renewal date (Stripe webhook fires): `profile.plan` → `'free'`

### Upgrades — unchanged
- [ ] Free → Single button reads **"Upgrade to Single"** → opens Stripe checkout
- [ ] Free → Couples button reads **"Upgrade to Couples"** → opens Stripe checkout
- [ ] Single → Couples button reads **"Upgrade to Couples"** → opens Stripe checkout
- [ ] Test card `4242 4242 4242 4242` → success → profile updates within ~5s

---

## 18. RLS sanity (don't expect breakages, but worth poking)

- [ ] Sign in as account A. Try to UPDATE a vault_entry where `user_id = <some other user's id>` via Supabase dashboard → should fail with RLS violation
- [ ] Try to INSERT into `audit_log` with `user_id` set to someone else's id → should fail
- [ ] Try to UPDATE `profiles` to change your `plan` from `single` to `couples` directly → should fail (only Stripe webhook can change plan)
- [ ] Try to UPDATE `partner_links.couples_payer_id` directly as a user → should fail (trigger blocks it)
- [ ] Console.log surface during normal use should have **no** `[audit_log] insert failed:` errors — that flag means the INSERT policy isn't applied
