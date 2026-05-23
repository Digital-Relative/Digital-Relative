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
export function clearSessionKey()  { _sessionKey = null }
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
  const [encUsername, encPassword, encNotes] = await Promise.all([
    entry.username ? encrypt(String(entry.username)) : Promise.resolve(null),
    entry.password ? encrypt(String(entry.password)) : Promise.resolve(null),
    entry.notes    ? encrypt(String(entry.notes))    : Promise.resolve(null),
  ])
  return { ...entry, username: encUsername, password: encPassword, notes: encNotes, _encrypted: true }
}

export async function decryptEntry(entry) {
  if (!entry._encrypted) return entry
  try {
    const [u, p, n] = await Promise.all([
      entry.username ? decrypt(String(entry.username)) : Promise.resolve(''),
      entry.password ? decrypt(String(entry.password)) : Promise.resolve(''),
      entry.notes    ? decrypt(String(entry.notes))    : Promise.resolve(''),
    ])
    return { ...entry, username: u, password: p, notes: n, _encrypted: false }
  } catch {
    return { ...entry, _decryptError: true, username: '[Decryption error]', password: '', notes: '' }
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
