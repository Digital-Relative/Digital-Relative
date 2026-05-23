import { useState, useEffect } from 'react'
import ChangePasswordPage from './ChangePasswordPage'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const { user, profile, updateProfile, signOut } = useAuth()
  const [name, setName]               = useState(profile?.full_name || '')
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [showChangePIN, setShowChangePIN] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState('')
  const [mfaFactors, setMfaFactors]   = useState([])
  const [showMfaSetup, setShowMfaSetup] = useState(false)
  const [qrCode, setQrCode]           = useState(null)
  const [mfaSecret, setMfaSecret]     = useState(null)
  const [mfaFactorId, setMfaFactorId] = useState(null)
  const [mfaCode, setMfaCode]         = useState('')
  const [verifying, setVerifying]     = useState(false)
  const [showLostDevice, setShowLostDevice] = useState(false)
  const [lostDeviceStep, setLostDeviceStep] = useState('send') // send | verify
  const [lostDeviceCode, setLostDeviceCode] = useState('')
  const [lostDeviceSending, setLostDeviceSending] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(profile?.marketing_opt_in || false)
  const [deviceLog, setDeviceLog]           = useState([])
  const [language, setLanguage]         = useState(profile?.preferred_language || 'en')
  const isOAuth = user?.app_metadata?.provider === 'google' || user?.app_metadata?.provider === 'apple'

  // HIGH-1 fix: hooks must come before any conditional return
  useEffect(() => {
    loadMfaFactors()
    loadDeviceLog()
  }, [])

  async function loadDeviceLog() {
    const { data } = await supabase
      .from('device_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setDeviceLog(data || [])
  }

  async function loadMfaFactors() {
    const { data } = await supabase.auth.mfa.listFactors()
    setMfaFactors(data?.totp || [])
  }

  async function startMfaSetup() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Digital Relative' })
    if (error) { toast.error(error.message); return }
    setQrCode(data.totp.qr_code)
    setMfaSecret(data.totp.secret)
    setMfaFactorId(data.id)
    setShowMfaSetup(true)
  }

  async function verifyMfa() {
    setVerifying(true)
    try {
      const { error: challengeError, data: challengeData } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
      if (challengeError) throw challengeError
      const { error } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challengeData.id, code: mfaCode })
      if (error) throw error
      toast.success('Two-factor authentication enabled')
      setShowMfaSetup(false)
      setMfaCode('')
      loadMfaFactors()
    } catch (err) {
      toast.error(err.message || 'Invalid code')
    } finally {
      setVerifying(false)
    }
  }

  async function removeMfa(factorId) {
    if (!confirm('Remove two-factor authentication? This will make your account less secure.')) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) { toast.error(error.message); return }
    toast.success('2FA removed')
    loadMfaFactors()
  }

  async function sendLostDeviceCode() {
    setLostDeviceSending(true)
    try {
      const { error } = await supabase.functions.invoke('mfa-email', {
        body: { action: 'send_code', userId: user.id, email: user.email },
      })
      if (error) throw error
      setLostDeviceStep('verify')
      toast.success('Verification code sent to ' + user.email)
    } catch (e) { toast.error(e.message || 'Could not send code') }
    finally { setLostDeviceSending(false) }
  }

  async function verifyLostDeviceCode() {
    setVerifying(true)
    try {
      // HIGH-4 fix: use mfa_unenroll action which uses service-role to delete the TOTP factor
      // This avoids the AAL2 requirement that would block client-side mfa.unenroll()
      const { data, error } = await supabase.functions.invoke('mfa-email', {
        body: { action: 'mfa_unenroll', userId: user.id, code: lostDeviceCode },
      })
      if (error || !data?.unenrolled) throw new Error('Invalid or expired code')
      toast.success('2FA cleared - please set up a new authenticator app')
      setShowLostDevice(false)
      setLostDeviceStep('send')
      setLostDeviceCode('')
      loadMfaFactors()
    } catch (e) { toast.error(e.message || 'Could not verify code') }
    finally { setVerifying(false) }
  }

  async function savePreferences() {
    try {
      await updateProfile({ marketing_opt_in: marketingOptIn, preferred_language: language })
      toast.success('Preferences saved')
    } catch { toast.error('Could not save preferences') }
  }

  async function handleSaveName() {
    setSaving(true)
    try { await updateProfile({ full_name: name }); toast.success('Name updated') }
    catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleExportData() {
    const id = toast.loading('Preparing export…')
    try {
      const [{ data: entries }, { data: bens }, { data: prof }] = await Promise.all([
        supabase.from('vault_entries').select('*').eq('user_id', user.id),
        supabase.from('beneficiaries').select('*').eq('user_id', user.id),
        supabase.from('profiles').select('id, full_name, plan, plan_renewal, created_at, updated_at, checkin_frequency_days, last_checkin, gdpr_consent_at, account_origin, vault_pin_set, mfa_enrolled').eq('id', user.id).single(),
      ])
      const exportPayload = {
        exported_at: new Date().toISOString(),
        encryption_notice: "vault_entries fields (username, password, notes) are AES-256-GCM encrypted. They cannot be read without your vault PIN. Digital Relative does not hold your PIN.",
        gdpr_basis: "GDPR Article 20 - Right to data portability",
        profile: prof,
        vault_entries: entries,
        beneficiaries: bens,
      }
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `digital-relative-export-${Date.now()}.json` })
      a.click()
      toast.dismiss(id); toast.success('Data exported')
    } catch (e) { toast.dismiss(id); toast.error(e.message) }
  }

  async function handleDeleteAccount() {
    if (confirmDelete !== 'DELETE') { toast.error('Type DELETE to confirm'); return }
    setDeleting(true)
    try {
      await supabase.functions.invoke('delete-account', { body: { userId: user.id } })
      await signOut()
    } catch (e) { toast.error(e.message); setDeleting(false) }
  }

  const hasMfa = mfaFactors.some(f => f.status === 'verified')

  if (showChangePIN) {
    return <ChangePasswordPage onBack={() => setShowChangePIN(false)} />
  }

  return (
    <div>
      <div className="fade-up page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Manage your account, security, and data.</p>
      </div>

      {/* Profile */}
      <div className="fade-up-2 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 16 }}>Profile</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <label className="label">Full name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="label">Email address</label>
            <input className="input" value={user?.email || ''} disabled style={{ opacity: 0.6 }} />
          </div>
        </div>
        {isOAuth && (
          <div style={{ fontSize: 12, color: 'var(--text-sub)', padding: '8px 12px', background: 'var(--gold-dim)', borderRadius: 'var(--r)', border: '1px solid var(--gold-border)', marginBottom: 14 }}>
            Signed in with {user?.app_metadata?.provider === 'google' ? 'Google' : 'Apple'} - security managed by your provider
          </div>
        )}
        <button className="btn-primary" onClick={handleSaveName} disabled={saving}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save changes'}
        </button>
      </div>

      {/* MFA - only show for email users */}
      {!isOAuth && (
        <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)' }}>Two-factor authentication</h3>
            <span className={`badge badge-${hasMfa ? 'green' : 'danger'}`}>{hasMfa ? 'Enabled' : 'Not enabled'}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 14 }}>
            {hasMfa
              ? 'Your account is protected with an authenticator app. We strongly recommend keeping this enabled.'
              : 'Your account is not protected with two-factor authentication. As this vault contains sensitive data, we strongly recommend enabling it.'}
          </p>

          {!hasMfa && !showMfaSetup && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={startMfaSetup}>Set up authenticator app</button>
            </div>
          )}
          {!hasMfa && profile?.mfa_email_fallback && (
            <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--cream-dim)' }}>
              ✓ Email verification is active as your 2FA method. Add an authenticator app above for better security.
            </div>
          )}

          {hasMfa && mfaFactors.filter(f => f.status === 'verified').map(f => (
            <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-sub)' }}>Authenticator app active</span>
              <button className="btn-danger" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => removeMfa(f.id)}>Remove</button>
            </div>
          ))}

          {showMfaSetup && (
            <div style={{ marginTop: 16, padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 500, marginBottom: 10 }}>Set up authenticator app</div>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.7 }}>
                Scan this QR code with Google Authenticator, Authy, or 1Password, then enter the 6-digit code to confirm.
              </div>
              {qrCode && <img src={qrCode} alt="MFA QR Code" style={{ width: 160, height: 160, marginBottom: 14, borderRadius: 8 }} />}
              {mfaSecret && (
                <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 14 }}>
                  Manual key: <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>{mfaSecret}</code>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input className="input" placeholder="000000" value={mfaCode} onChange={e => setMfaCode(e.target.value)}
                  maxLength={6} style={{ width: 140, textAlign: 'center', fontSize: 18, letterSpacing: '0.2em' }} />
                <button className="btn-primary" onClick={verifyMfa} disabled={verifying || mfaCode.length !== 6}>
                  {verifying ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Verify & enable'}
                </button>
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowMfaSetup(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security */}
      {!isOAuth && (
        <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Password</h3>
          <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14 }}>
            Your vault is encrypted with AES-256-GCM using a key derived from your vault PIN. Even Digital Relative cannot read your data.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowChangePIN(true)}>
              Change vault PIN
            </button>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={async () => {
              if (!confirm('Your vault PIN and login password are separate credentials.\n\nResetting your password will NOT affect your vault - you can still unlock it with your PIN.\n\nContinue with password reset?')) return
              await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin })
              toast.success('Password reset email sent')
            }}>
              Reset login password
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 8, lineHeight: 1.6 }}>
            Your vault PIN (used to encrypt your data) is separate from your login password. Use "Change vault PIN" to safely re-encrypt your vault.
          </div>
        </div>
      )}

      {/* Language and preferences */}
      <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 14 }}>Language and preferences</h3>
        <div style={{ marginBottom: 14 }}>
          <label className="label" style={{ marginBottom: 8 }}>Display language</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { code: 'en', label: 'English',  flag: '🇬🇧' },
              { code: 'pl', label: 'Polski',   flag: '🇵🇱' },
              { code: 'ur', label: 'اردو',     flag: '🇵🇰' },
              { code: 'ar', label: 'العربية',  flag: '🇸🇦' },
            ].map(lang => (
              <button key={lang.code} onClick={() => setLanguage(lang.code)} style={{
                padding: '8px 14px', borderRadius: 'var(--r)', fontSize: 13, cursor: 'pointer',
                background: language === lang.code ? 'var(--gold)' : 'transparent',
                color: language === lang.code ? '#0d1b2a' : 'var(--text-sub)',
                border: language === lang.code ? 'none' : '1px solid var(--border-md)',
                fontFamily: 'var(--sans)', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {lang.flag} {lang.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={marketingOptIn}
              onChange={e => setMarketingOptIn(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--gold)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.6 }}>
              I'd like to hear about product updates, guides, and partner offers (wills, funeral care, insurance)
            </span>
          </label>
        </div>
        <button className="btn-primary" style={{ fontSize: 13 }} onClick={savePreferences}>Save preferences</button>
      </div>

      {/* Lost device / MFA reset */}
      {!isOAuth && hasMfa && (
        <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Lost your authenticator device?</h3>
          <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.7 }}>
            If you've lost your phone or authenticator app, verify your identity by email to reset 2FA and set up a new device.
          </p>
          {!showLostDevice ? (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowLostDevice(true)}>
              Reset 2FA via email
            </button>
          ) : (
            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              {lostDeviceStep === 'send' ? (
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 12, lineHeight: 1.6 }}>
                    We'll send a one-time code to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>. Entering the code will remove your current 2FA so you can set up a new device.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" style={{ fontSize: 12 }} onClick={sendLostDeviceCode} disabled={lostDeviceSending}>
                      {lostDeviceSending ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Send code to my email'}
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowLostDevice(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 12 }}>
                    Enter the 6-digit code sent to {user?.email}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input className="input" placeholder="000000" value={lostDeviceCode}
                      onChange={e => setLostDeviceCode(e.target.value)} maxLength={6}
                      style={{ width: 140, textAlign: 'center', fontSize: 18, letterSpacing: '0.2em' }} />
                    <button className="btn-danger" style={{ fontSize: 12 }} onClick={verifyLostDeviceCode} disabled={verifying || lostDeviceCode.length !== 6}>
                      {verifying ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Remove 2FA'}
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setLostDeviceStep('send')}>Back</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Device log */}
      <div className="fade-up-4 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Recent sign-ins</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.6 }}>
          You'll receive an email if a new device signs in. If you see anything unexpected, change your password immediately.
        </p>
        {deviceLog.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>No sign-in history yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {deviceLog.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>{d.user_agent?.includes('Mobile') ? '📱' : '💻'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {d.location || 'Unknown location'}
                    {i === 0 && <span className="badge badge-green" style={{ marginLeft: 8, fontSize: 10 }}>Current</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>
                    {new Date(d.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    {d.ip_address && d.ip_address !== 'Unknown' ? ` - ${d.ip_address}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GDPR */}
      <div className="fade-up-4 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Your data (GDPR)</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 14 }}>
          Under GDPR Article 20 you have the right to a copy of all data we hold. Your data is stored in the UK (Supabase London region) and never sold or shared with third parties.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={handleExportData}>Export all my data (JSON)</button>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => toast('Contact privacy@digitalrelative.co.uk', { icon: '✉️' })}>Contact data controller</button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="fade-up-4 card-static" style={{ borderColor: 'rgba(224,82,82,0.25)' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--danger)', marginBottom: 8 }}>Delete account</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 14 }}>
          Permanently deletes your account, all vault entries, beneficiaries, and uploaded files. Cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" placeholder='Type "DELETE" to confirm' value={confirmDelete}
            onChange={e => setConfirmDelete(e.target.value)} style={{ width: 240, borderColor: 'rgba(224,82,82,0.3)' }} />
          <button className="btn-danger" onClick={handleDeleteAccount} disabled={deleting}>
            {deleting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Delete my account'}
          </button>
        </div>
      </div>
    </div>
  )
}
