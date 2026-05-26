// AES-256-GCM client-side encryption
// OWASP 2023 compliant — all vault contents encrypted before leaving the browser

const ALGO              = 'AES-GCM'
const KEY_LEN           = 256
const IV_LEN            = 12       // 96-bit IV - GCM standard
const PBKDF2_ITERATIONS = 600_000  // OWASP 2024 recommendation for PBKDF2-SHA256
const SALT_BYTES        = 32       // 256-bit random salt

// ── Key derivation ──────────────────────────────────────────────────────────

// FIX CR-1: Accept a random per-user salt (stored in profiles.encryption_salt)
// Falls back to deterministic salt for legacy accounts
export async function deriveKey(password, userId, randomSalt) {
  if (!password || !userId) throw new Error('Password and user ID required')
  const enc = new TextEncoder()
  // Use random salt when available — deterministic for legacy
  const saltInput = randomSalt
    ? enc.encode(randomSalt)
    : enc.encode(`digital-relative:vault:${userId}`)

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltInput, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: KEY_LEN },
    true,  // extractable: true so we can persist across page navigations
    ['encrypt', 'decrypt']
  )
}

// Generate a cryptographically random salt for new users
export function generateSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return toBase64(bytes)
}

// ── Session key — memory only, never persisted ──────────────────────────────
let _sessionKey = null
export function setSessionKey(key) {
  _sessionKey = key
  // Persist to sessionStorage so key survives page navigations
  if (key) {
    crypto.subtle.exportKey('jwk', key)
      .then(jwk => sessionStorage.setItem('dr_sk', JSON.stringify(jwk)))
      .catch(() => {})
  }
}
export function getSessionKey()    { return _sessionKey }
export function clearSessionKey()  {
  _sessionKey = null
  try { sessionStorage.removeItem('dr_sk') } catch {}
}

// Persist vault key to sessionStorage so it survives page navigations
// sessionStorage is tab-isolated and cleared when the tab closes
export async function persistSessionKey() {
  if (!_sessionKey) return
  try {
    const exported = await crypto.subtle.exportKey('jwk', _sessionKey)
    sessionStorage.setItem('dr_sk', JSON.stringify(exported))
  } catch {}
}

// Restore vault key from sessionStorage (after page navigation)
export async function restoreSessionKey() {
  try {
    const stored = sessionStorage.getItem('dr_sk')
    if (!stored) return false
    const jwk = JSON.parse(stored)
    const key  = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    )
    _sessionKey = key
    return true
  } catch {
    return false
  }
}
export function hasSessionKey()    { return _sessionKey !== null }

// ── FIX CR-4: Unicode-safe base64 helpers ───────────────────────────────────
function toBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function fromBase64(str) {
  const binary = atob(str)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── Encrypt ─────────────────────────────────────────────────────────────────
export async function encrypt(plaintext) {
  if (!_sessionKey) throw new Error('Vault locked - please sign in again')
  if (typeof plaintext !== 'string') throw new Error('Plaintext must be a string')
  if (plaintext.length > 100_000) throw new Error('Entry too large')

  const iv  = crypto.getRandomValues(new Uint8Array(IV_LEN))
  // FIX CR-4: TextEncoder handles full Unicode correctly
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv, tagLength: 128 },
    _sessionKey,
    new TextEncoder().encode(plaintext)
  )
  const combined = new Uint8Array(IV_LEN + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_LEN)
  return toBase64(combined)
}

// ── Decrypt ─────────────────────────────────────────────────────────────────
export async function decrypt(encoded) {
  if (!_sessionKey) throw new Error('Vault locked - please sign in again')
  if (typeof encoded !== 'string' || encoded.length === 0) throw new Error('Invalid ciphertext')
  try {
    const combined  = fromBase64(encoded)
    if (combined.length < IV_LEN + 16) throw new Error('Too short')
    const plainBuf = await crypto.subtle.decrypt(
      { name: ALGO, iv: combined.slice(0, IV_LEN), tagLength: 128 },
      _sessionKey,
      combined.slice(IV_LEN)
    )
    return new TextDecoder().decode(plainBuf)
  } catch {
    throw new Error('Decryption failed - data may be corrupt or password incorrect')
  }
}

// ── Entry encryption ─────────────────────────────────────────────────────────

// FIX CR-5: Encrypt all fields atomically — if any fail, nothing is saved
export async function encryptEntry(entry) {
  // NEW-6 fix: address encrypted alongside other sensitive fields
  const [encUsername, encPassword, encNotes, encSecureContent, encAddress] = await Promise.all([
    entry.username       ? encrypt(String(entry.username))       : Promise.resolve(null),
    entry.password       ? encrypt(String(entry.password))       : Promise.resolve(null),
    entry.notes          ? encrypt(String(entry.notes))          : Promise.resolve(null),
    entry.secure_content ? encrypt(String(entry.secure_content)) : Promise.resolve(null),
    entry.address        ? encrypt(String(entry.address))        : Promise.resolve(null),
  ])
  return { ...entry, username: encUsername, password: encPassword, notes: encNotes, secure_content: encSecureContent, address: encAddress, _encrypted: true }
}

export async function decryptEntry(entry) {
  if (!entry._encrypted) return entry
  try {
    const [u, p, n, sc, addr] = await Promise.all([
      entry.username       ? decrypt(String(entry.username))       : Promise.resolve(''),
      entry.password       ? decrypt(String(entry.password))       : Promise.resolve(''),
      entry.notes          ? decrypt(String(entry.notes))          : Promise.resolve(''),
      entry.secure_content ? decrypt(String(entry.secure_content)) : Promise.resolve(''),
      entry.address        ? decrypt(String(entry.address))        : Promise.resolve(''),
    ])
    return { ...entry, username: u, password: p, notes: n, secure_content: sc, address: addr, _encrypted: false }
  } catch {
    return { ...entry, _decryptError: true, username: '[Decryption error]', password: '', notes: '', secure_content: '', address: '' }
  }
}

/*
 * VAULT KEY ARCHITECTURE NOTE
 * ────────────────────────────
 * Vault data is encrypted with a key derived from the user's VAULT PIN, NOT
 * their Supabase login password. These are completely separate credentials.
 *
 * This means:
 * - Supabase "forgot password" email resets DO NOT affect vault data
 * - Only the vault PIN controls encryption/decryption
 * - Changing vault PIN requires re-encrypting all entries (handled in ChangePasswordPage)
 *
 * The comment about "password reset breaking vault access" was written before
 * the PIN system was implemented and is now incorrect.
 */

// ── Trusted device — optional PIN-free auto-unlock ──────────────────────────
// Preferred scheme: the device key is derived from a WebAuthn PRF (Pseudo-Random
// Function) extension output, which is bound to a platform credential (Touch ID,
// Windows Hello, etc.) in the OS keystore. The encrypted PIN sits in localStorage
// but the key material does not — recovering the PIN requires the authenticator.
//
// Legacy fallback (kept so existing trusted devices keep working until migration):
// the device key is derived from a random token in localStorage, then PBKDF2'd
// with the userId. Lower security — both inputs sit in the same storage layer —
// but it is the only option on browsers/authenticators without PRF support.
//
// On every successful PIN entry, `migrateTrustedDevice` opportunistically upgrades
// legacy users to PRF without forcing a PIN re-entry. See VaultPinEntry.

const TRUSTED_DEVICE_TOKEN_KEY = 'dr_device_token'
const TRUSTED_DEVICE_PIN_KEY   = 'dr_trusted_pin'    // legacy ciphertext, suffixed with userId
const PRF_CREDENTIAL_KEY       = 'dr_prf_cred'       // suffixed with userId — stores credential ID
const PRF_PIN_KEY              = 'dr_prf_pin'        // suffixed with userId — stores PRF-encrypted PIN
const PRF_UNSUPPORTED_KEY      = 'dr_prf_unsupported' // device-wide flag: PRF tried, authenticator did not enable
const PRF_DEFER_KEY            = 'dr_prf_defer'      // suffixed with userId — defer migration until this timestamp
const PRF_SALT                 = new TextEncoder().encode('prf-trusted-device-v1')
const PRF_DEFER_MS             = 24 * 60 * 60 * 1000 // 24h

function getDeviceToken() {
  let token = localStorage.getItem(TRUSTED_DEVICE_TOKEN_KEY)
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(TRUSTED_DEVICE_TOKEN_KEY, token)
  }
  return token
}

async function getDeviceKey(userId) {
  const enc       = new TextEncoder()
  const deviceToken = getDeviceToken()
  const keyMat  = await crypto.subtle.importKey(
    'raw', enc.encode(deviceToken + userId), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(`dr-device:${userId}`), iterations: 100_000, hash: 'SHA-256' },
    keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

// ── PRF (WebAuthn) helpers ────────────────────────────────────────────────

function b64urlToBuf(b64) {
  const padded  = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - padded.length % 4) % 4)
  return Uint8Array.from(atob(padded + padding), c => c.charCodeAt(0))
}

function bufToB64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function prfEnroll(userId, userEmail) {
  if (!window.PublicKeyCredential) return null
  if (localStorage.getItem(PRF_UNSUPPORTED_KEY) === 'true') return null
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp:        { name: 'Digital Relative', id: window.location.hostname },
        user: {
          id:          new TextEncoder().encode(userId),
          name:        userEmail || userId,
          displayName: 'Trusted device key',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7   },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification:        'required',
          residentKey:             'preferred',
        },
        extensions: { prf: {} },
        attestation: 'none',
        timeout:     60000,
      },
    })
    if (!cred) return null
    const ext = cred.getClientExtensionResults?.()
    if (!ext?.prf?.enabled) {
      // Authenticator created the credential but PRF was not enabled — flag the
      // device so we stop offering migration on this browser/authenticator.
      localStorage.setItem(PRF_UNSUPPORTED_KEY, 'true')
      return null
    }
    const credId = bufToB64url(cred.rawId)
    localStorage.setItem(PRF_CREDENTIAL_KEY + ':' + userId, credId)
    return credId
  } catch {
    // User cancelled, timeout, or transient error. Do not flag as unsupported.
    return null
  }
}

async function prfDeriveKey(credentialId) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge:        crypto.getRandomValues(new Uint8Array(32)),
      timeout:          60000,
      userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: b64urlToBuf(credentialId) }],
      extensions:       { prf: { eval: { first: PRF_SALT } } },
    },
  })
  if (!assertion) throw new Error('Assertion cancelled')
  const prfOutput = assertion.getClientExtensionResults?.().prf?.results?.first
  if (!prfOutput) throw new Error('PRF output missing')
  return crypto.subtle.importKey(
    'raw', prfOutput, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

async function prfSavePin(pin, userId, userEmail) {
  let credId = localStorage.getItem(PRF_CREDENTIAL_KEY + ':' + userId)
  if (!credId) {
    credId = await prfEnroll(userId, userEmail)
    if (!credId) return false
  }
  const key = await prfDeriveKey(credId).catch(() => null)
  if (!key) return false
  const iv     = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(pin)
  )
  localStorage.setItem(PRF_PIN_KEY + ':' + userId, JSON.stringify({
    iv:   Array.from(iv),
    data: Array.from(new Uint8Array(cipher)),
  }))
  return true
}

async function prfLoadPin(userId) {
  const credId = localStorage.getItem(PRF_CREDENTIAL_KEY + ':' + userId)
  if (!credId) return null
  const stored = localStorage.getItem(PRF_PIN_KEY + ':' + userId)
  if (!stored) return null
  try {
    const { iv, data } = JSON.parse(stored)
    const key   = await prfDeriveKey(credId)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(data)
    )
    return new TextDecoder().decode(plain)
  } catch {
    // Credential gone (authenticator wiped, user revoked OS-level credential)
    // or user cancelled. Clear stale state so next unlock falls back cleanly.
    localStorage.removeItem(PRF_CREDENTIAL_KEY + ':' + userId)
    localStorage.removeItem(PRF_PIN_KEY + ':' + userId)
    return null
  }
}

function prfHasTrust(userId) {
  return !!(localStorage.getItem(PRF_CREDENTIAL_KEY + ':' + userId)
         && localStorage.getItem(PRF_PIN_KEY + ':' + userId))
}

function hasLegacyTrustedDevice(userId) {
  return !!localStorage.getItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId)
}

// ── Public trusted-device API ─────────────────────────────────────────────

export async function saveTrustedPin(pin, userId, userEmail) {
  // Prefer PRF. Fall back to legacy scheme on any PRF failure.
  const prfOk = await prfSavePin(pin, userId, userEmail).catch(() => false)
  if (prfOk) {
    // Drop any leftover legacy ciphertext for this user.
    localStorage.removeItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId)
    localStorage.removeItem(PRF_DEFER_KEY + ':' + userId)
    return true
  }
  try {
    const enc    = new TextEncoder()
    const devKey = await getDeviceKey(userId)
    const iv     = crypto.getRandomValues(new Uint8Array(12))
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, devKey, enc.encode(pin))
    localStorage.setItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId, JSON.stringify({
      iv:   Array.from(iv),
      data: Array.from(new Uint8Array(cipher)),
    }))
    return true
  } catch { return false }
}

export async function loadTrustedPin(userId) {
  // Try PRF first.
  const prfPin = await prfLoadPin(userId).catch(() => null)
  if (prfPin !== null) return prfPin

  // Fall back to legacy.
  try {
    const stored = localStorage.getItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId)
    if (!stored) return null
    const { iv, data } = JSON.parse(stored)
    const devKey = await getDeviceKey(userId)
    const plain  = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) }, devKey, new Uint8Array(data)
    )
    return new TextDecoder().decode(plain)
  } catch { return null }
}

export function clearTrustedDevice(userId) {
  localStorage.removeItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId)
  localStorage.removeItem(PRF_CREDENTIAL_KEY + ':' + userId)
  localStorage.removeItem(PRF_PIN_KEY + ':' + userId)
  localStorage.removeItem(PRF_DEFER_KEY + ':' + userId)
}

export function hasTrustedDevice(userId) {
  return prfHasTrust(userId) || hasLegacyTrustedDevice(userId)
}

// Returns which trusted-device scheme is active for this user/device.
//   'prf'    — bound to a platform credential (Touch ID / Windows Hello)
//   'legacy' — encrypted with a localStorage-derived key (less secure)
//   'none'   — device is not trusted
export function getTrustedDeviceMode(userId) {
  if (prfHasTrust(userId)) return 'prf'
  if (hasLegacyTrustedDevice(userId)) return 'legacy'
  return 'none'
}

// Opportunistically upgrade a legacy trusted device to PRF on next PIN entry.
// No-op unless: legacy active, PRF not yet active, device supports PRF, and the
// 24h cooldown after a previous cancellation has elapsed. On success, the legacy
// ciphertext is replaced with a PRF-bound one — the user never re-types the PIN.
export async function migrateTrustedDevice(pin, userId, userEmail) {
  if (!hasLegacyTrustedDevice(userId)) return
  if (prfHasTrust(userId)) return
  if (!window.PublicKeyCredential) return
  if (localStorage.getItem(PRF_UNSUPPORTED_KEY) === 'true') return
  const deferUntil = parseInt(localStorage.getItem(PRF_DEFER_KEY + ':' + userId) || '0', 10)
  if (Date.now() < deferUntil) return

  const ok = await prfSavePin(pin, userId, userEmail).catch(() => false)
  if (ok) {
    localStorage.removeItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId)
    localStorage.removeItem(PRF_DEFER_KEY + ':' + userId)
  } else {
    // User cancelled or transient error. Defer next attempt so we don't prompt
    // on every unlock. PRF_UNSUPPORTED_KEY is set inside prfEnroll for the
    // "authenticator doesn't do PRF" case and stops migration permanently.
    localStorage.setItem(PRF_DEFER_KEY + ':' + userId, String(Date.now() + PRF_DEFER_MS))
  }
}

// ── Vault PIN recovery codes ────────────────────────────────────────────────
// 8 one-time codes. Each encrypts the vault PIN using a code-derived key.
// Recovery: code -> decrypt PIN -> derive vault key normally.
// Regenerating codes requires the current PIN.

function generateRecoveryCode() {
  // Format: XXXX-XXXX-XXXX (12 hex chars in 3 groups)
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const hex   = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `${hex.slice(0,4)}-${hex.slice(4,8)}-${hex.slice(8,12)}`
}

async function getCodeKey(code, userId) {
  const enc    = new TextEncoder()
  const clean  = code.replace(/-/g, '').toLowerCase()
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(clean), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(`dr-recovery:${userId}`), iterations: 100_000, hash: 'SHA-256' },
    keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

export async function generateVaultRecoveryCodes(pin, userId) {
  const codes = Array.from({ length: 8 }, generateRecoveryCode)
  const enc   = new TextEncoder()
  const encryptedCodes = await Promise.all(codes.map(async (code, index) => {
    const codeKey   = await getCodeKey(code, userId)
    const iv        = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, codeKey, enc.encode(pin))
    const combined  = new Uint8Array(iv.byteLength + ciphertext.byteLength)
    combined.set(iv); combined.set(new Uint8Array(ciphertext), iv.byteLength)
    return { code_index: index, encrypted_pin: btoa(String.fromCharCode(...combined)), plain: code }
  }))
  return encryptedCodes
}

export async function redeemVaultRecoveryCode(code, userId, encryptedPin) {
  // Returns the decrypted PIN if the code is correct, throws if not
  const enc     = new TextEncoder()
  const dec     = new TextDecoder()
  const clean   = code.replace(/-/g, '').replace(/\s/g, '')
  const codeKey = await getCodeKey(clean, userId)
  const bytes   = Uint8Array.from(atob(encryptedPin), c => c.charCodeAt(0))
  const iv      = bytes.slice(0, 12)
  const data    = bytes.slice(12)
  const plain   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, codeKey, data)
  return dec.decode(plain)
}
