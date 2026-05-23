// Vault PIN management
// The PIN is separate from the login password and is used solely
// to derive the AES-256 encryption key. It never leaves the device.
// Works identically for email, Google, and Apple users.

const PIN_SALT_KEY = 'dr_pin_salt' // stored in memory only during session

// Validate PIN strength
export function validatePin(pin) {
  if (!pin || typeof pin !== 'string') return 'PIN is required'
  const digits = pin.replace(/\D/g, '')
  if (digits.length < 6) return 'PIN must be at least 6 digits'
  if (digits.length > 12) return 'PIN must be no more than 12 digits'
  // Reject obvious weak PINs
  if (/^(\d)\1+$/.test(digits)) return 'PIN cannot be all the same digit'
  if (['123456','654321','012345','111111','000000','123123'].includes(digits))
    return 'PIN is too common - please choose a less predictable one'
  return null
}

// Format PIN input — digits only
export function formatPin(raw) {
  return raw.replace(/\D/g, '').slice(0, 12)
}

// Check if PIN is set for this user (stored as a flag in profiles)
// We never store the PIN itself — only whether one has been set
export function pinIsSet(profile) {
  return !!profile?.vault_pin_set
}
