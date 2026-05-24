import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { deriveKey, setSessionKey, clearSessionKey } from '../lib/crypto'

const AuthContext = createContext(null)

// Auto-lock vault after 30 minutes of inactivity
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
// Hard 8-hour absolute session limit regardless of activity
const ABSOLUTE_SESSION_MS   = 8 * 60 * 60 * 1000
const SESSION_START_KEY     = 'dr_session_start'

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)
  const [profile, setProfile]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const inactivityTimer               = useRef(null)
  const transitionTimer               = useRef(null)

  // Reset inactivity timer on user activity
  function resetInactivityTimer() {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    inactivityTimer.current = setTimeout(() => {
      clearSessionKey()
    }, INACTIVITY_TIMEOUT_MS)
  }

  // Absolute session timeout - locks vault after 8 hours regardless of activity
  // Applies to all users including trusted devices
  function startAbsoluteSessionTimer() {
    const sessionStart = parseInt(sessionStorage.getItem(SESSION_START_KEY) || '0', 10)
    const now = Date.now()
    if (!sessionStart) {
      sessionStorage.setItem(SESSION_START_KEY, String(now))
    }
    const elapsed   = sessionStart ? now - sessionStart : 0
    const remaining = ABSOLUTE_SESSION_MS - elapsed
    if (remaining <= 0) {
      clearSessionKey()
      return
    }
    setTimeout(() => {
      clearSessionKey()
      sessionStorage.removeItem(SESSION_START_KEY)
    }, remaining)
  }

  useEffect(() => {
    startAbsoluteSessionTimer()
    // Listen for user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }))
    resetInactivityTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer))
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Brief transition state to prevent flickering between auth states
      setTransitioning(true)
      if (transitionTimer.current) clearTimeout(transitionTimer.current)
      transitionTimer.current = setTimeout(() => setTransitioning(false), 400)

      // Always clear the session key on a new sign-in so the PIN prompt shows
      // This covers Google OAuth redirects where the module may not have reloaded
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        clearSessionKey()
      }

      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else {
        setProfile(null)
        clearSessionKey()
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    // MED-3 fix: only select required columns — exclude stripe IDs and mfa_backup_email
    const cols = [
      'id', 'full_name', 'plan', 'plan_renewal',
      'created_at', 'updated_at',
      'checkin_frequency_days', 'last_checkin',
      'gdpr_consent_at', 'account_origin',
      'vault_pin_set', 'mfa_enrolled', 'mfa_email_fallback',
      'encryption_salt', 'key_verification',
      'duress_pin_set', 'duress_key_verification',
      'marketing_opt_in', 'preferred_language', 'phone_number',
      'getting_started_dismissed', 'getting_started_done_items',
    ].join(',')
    const { data } = await supabase
      .from('profiles')
      .select(cols)
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  async function signUp({ email, password, fullName, marketingOptIn = false }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, marketing_opt_in: marketingOptIn } },
    })
    if (error) throw error
    // Do NOT derive a key from the password here.
    // Email users go through VaultPinSetup immediately after signup,
    // which derives the real key from their PIN + a fresh random salt.
    // Deriving a password-based key here would:
    //   a) use the old deterministic salt (no random salt yet)
    //   b) be immediately overwritten by VaultPinSetup anyway
    // So we just start the inactivity timer and let VaultPinSetup handle keying.
    if (data.user) {
      resetInactivityTimer()
    }
    return data
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    supabase.from('audit_log').insert({ action: 'signed_in', metadata: { method: 'email' } }).catch(() => {})
    // Do NOT derive a key from the password here.
    // The vault key is derived from the vault PIN (not the login password).
    // VaultPinEntry will handle key derivation using PIN + randomSalt from profile.
    // Deriving here would set the WRONG key (uses deterministic salt, not the user's randomSalt).
    resetInactivityTimer()
    return data
  }

  async function signOut() {
    clearSessionKey()
    sessionStorage.removeItem(SESSION_START_KEY)
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    await supabase.auth.signOut()
  }

  async function updateProfile(updates) {
    // Whitelist allowed fields — prevent client escalating plan
    const safeFields = ['full_name', 'last_checkin', 'checkin_frequency_days', 'marketing_opt_in', 'preferred_language', 'phone_number', 'getting_started_dismissed', 'getting_started_done_items', 'duress_pin_set', 'duress_key_verification']
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k]) => safeFields.includes(k))
    )
    if (Object.keys(safeUpdates).length === 0) throw new Error('No valid fields to update')

    const { error } = await supabase
      .from('profiles')
      .update(safeUpdates)
      .eq('id', user.id)
    if (error) throw error
    setProfile(prev => ({ ...prev, ...safeUpdates }))
  }

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, loading, transitioning, signUp, signIn, signOut, updateProfile, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
