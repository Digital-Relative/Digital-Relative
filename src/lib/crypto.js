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
    false,
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
export function setSessionKey(key) { _sessionKey = key }
export function getSessionKey()    { return _sessionKey }
export function clearSessionKey()  {
  if (_sessionKey !== null) {
    // Log stack trace to identify what's clearing the key
    console.warn('[DR] clearSessionKey called', new Error().stack?.split('\n').slice(1,4).join(' | '))
  }
  _sessionKey = null
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
// Stores the vault PIN encrypted with a device-specific key in localStorage.
// The device key is derived from a random token stored in localStorage.
// Clearing localStorage (or user revoking trust) removes the ability to auto-unlock.
// The PIN is NEVER stored in plaintext.

const TRUSTED_DEVICE_TOKEN_KEY = 'dr_device_token'
const TRUSTED_DEVICE_PIN_KEY   = 'dr_trusted_pin'  // prefix, suffixed with userId

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

export async function saveTrustedPin(pin, userId) {
  try {
    const enc    = new TextEncoder()
    const devKey = await getDeviceKey(userId)
    const iv     = crypto.getRandomValues(new Uint8Array(12))
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, devKey, enc.encode(pin)
    )
    const stored = JSON.stringify({
      iv:   Array.from(iv),
      data: Array.from(new Uint8Array(cipher)),
    })
    localStorage.setItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId, stored)
    return true
  } catch { return false }
}

export async function loadTrustedPin(userId) {
  try {
    const stored = localStorage.getItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId)
    if (!stored) return null
    const { iv, data } = JSON.parse(stored)
    const devKey = await getDeviceKey(userId)
    const plain  = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      devKey,
      new Uint8Array(data)
    )
    return new TextDecoder().decode(plain)
  } catch { return null }
}

export function clearTrustedDevice(userId) {
  localStorage.removeItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId)
}

export function hasTrustedDevice(userId) {
  return !!localStorage.getItem(TRUSTED_DEVICE_PIN_KEY + ':' + userId)
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
