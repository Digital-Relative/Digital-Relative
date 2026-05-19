// AES-256-GCM client-side encryption
// Data is encrypted in the browser before being sent to Supabase.
// Even Supabase (and us) cannot read vault contents.

const ALGO = 'AES-GCM'
const KEY_LEN = 256

// Derive a CryptoKey from the user's password + their Supabase user ID (salt)
export async function deriveKey(password, userId) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(userId), iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: KEY_LEN },
    false,
    ['encrypt', 'decrypt']
  )
}

// Store derived key in memory for the session (never persisted)
let _sessionKey = null
export function setSessionKey(key) { _sessionKey = key }
export function getSessionKey() { return _sessionKey }
export function clearSessionKey() { _sessionKey = null }

export async function encrypt(plaintext) {
  if (!_sessionKey) throw new Error('No encryption key set')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv }, _sessionKey, enc.encode(plaintext)
  )
  // Combine iv + ciphertext, base64 encode
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.byteLength)
  return btoa(String.fromCharCode(...combined))
}

export async function decrypt(encoded) {
  if (!_sessionKey) throw new Error('No encryption key set')
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plainBuf = await crypto.subtle.decrypt({ name: ALGO, iv }, _sessionKey, ciphertext)
  return new TextDecoder().decode(plainBuf)
}

// Encrypt an entire vault entry object (only sensitive fields)
export async function encryptEntry(entry) {
  return {
    ...entry,
    username: entry.username ? await encrypt(entry.username) : null,
    password: entry.password ? await encrypt(entry.password) : null,
    notes:    entry.notes    ? await encrypt(entry.notes)    : null,
    _encrypted: true,
  }
}

// Decrypt an entire vault entry object
export async function decryptEntry(entry) {
  if (!entry._encrypted) return entry
  return {
    ...entry,
    username: entry.username ? await decrypt(entry.username) : '',
    password: entry.password ? await decrypt(entry.password) : '',
    notes:    entry.notes    ? await decrypt(entry.notes)    : '',
    _encrypted: false,
  }
}
