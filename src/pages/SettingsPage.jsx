import { useState, useEffect } from 'react'
import ChangePasswordPage from './ChangePasswordPage'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { clearTrustedDevice, hasTrustedDevice, getTrustedDeviceMode } from '../lib/crypto'
import { GenerateRecoveryCodes } from '../components/VaultRecoveryCodes'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { WebAuthnSetup } from '../components/WebAuthnSetup'
import DuressPinSetup from '../components/DuressPinSetup'
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
  const [phoneNumber, setPhoneNumber]       = useState(profile?.phone_number || '')
  const [deviceTrusted, setDeviceTrusted]   = useState(() => user ? hasTrustedDevice(user.id) : false)
  const [trustMode, setTrustMode]           = useState(() => user ? getTrustedDeviceMode(user.id) : 'none')
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false)
  const [showWebAuthn, setShowWebAuthn] = useState(false)
  const [showContactModal, setShowContactModal] = useState(false)
  const { supported: pushSupported, permission: pushPermission, subscribed: pushSubscribed,
          loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications()
  const [showDuressSetup, setShowDuressSetup] = useState(false)
  const [deviceLog, setDeviceLog]     = useState([])
  const [auditLog, setAuditLog]       = useState([])
  const [language, setLanguage]         = useState(profile?.preferred_language || 'en')
  const isOAuth = user?.app_metadata?.provider === 'google' || user?.app_metadata?.provider === 'apple'

  // HIGH-1 fix: hooks must come before any conditional return
  useEffect(() => {
    loadMfaFactors()
    loadDeviceLog()
    loadAuditLog()
  }, [])

  async function loadAuditLog() {
    const { data } = await supabase
      .from('audit_log')
      .select('action, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setAuditLog(data || [])
  }

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

  function revokeTrustedDevice() {
    if (user?.id) {
      clearTrustedDevice(user.id)
      setDeviceTrusted(false)
      setTrustMode('none')
      toast.success('Trusted device removed - PIN will be required next time')
    }
  }

  async function savePreferences() {
    try {
      // Validate phone format if provided
    if (phoneNumber && !/^\+[1-9]\d{7,14}$/.test(phoneNumber.replace(/\s/g, ''))) {
      toast.error('Phone number must be in international format e.g. +447911123456')
      return
    }
    await updateProfile({
      marketing_opt_in: marketingOptIn,
      preferred_language: language,
      phone_number: phoneNumber.replace(/\s/g, '') || null,
    })
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
      // NEW-5 fix: comprehensive export covering all personal data tables (GDPR Art 15/20)
      const [
        { data: entries }, { data: bens }, { data: prof },
        { data: auditLog }, { data: deviceLog }, { data: notifications },
        { data: afterIAmGone }, { data: sharedLinks }, { data: documents },
        { data: decoyEntries }, { data: pushSubs }, { data: webAuthnCreds },
      ] = await Promise.all([
        supabase.from('vault_entries').select('*').eq('user_id', user.id),
        supabase.from('beneficiaries').select('*').eq('user_id', user.id),
        supabase.from('profiles').select('id, full_name, plan, plan_renewal, created_at, updated_at, checkin_frequency_days, last_checkin, gdpr_consent_at, account_origin, vault_pin_set, mfa_enrolled, marketing_opt_in, preferred_language, phone_number').eq('id', user.id).single(),
        supabase.from('audit_log').select('action, created_at, metadata').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1000),
        supabase.from('device_log').select('ip_address, user_agent, location, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500),
        supabase.from('notifications').select('type, title, message, read, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
        supabase.from('after_i_am_gone').select('guide_data, personal_message, funeral_wishes, updated_at').eq('user_id', user.id).maybeSingle(),
        supabase.from('shared_links').select('id, content_label, created_at, expires_at, view_count').eq('user_id', user.id),
        supabase.from('vault_documents').select('id, file_name, category, notes, created_at').eq('user_id', user.id),
        supabase.from('decoy_entries').select('id, title, category, created_at').eq('user_id', user.id),
        supabase.from('push_subscriptions').select('endpoint, created_at, active').eq('user_id', user.id),
        supabase.from('webauthn_credentials').select('device_name, created_at, last_used_at').eq('user_id', user.id),
      ])
      const exportPayload = {
        exported_at: new Date().toISOString(),
        encryption_notice: "vault_entries fields (username, password, notes, secure_content) are AES-256-GCM encrypted. They cannot be read without your vault PIN. Digital Relative does not hold your PIN.",
        gdpr_basis: "GDPR Article 20 - Right to data portability",
        profile: prof,
        vault_entries: entries,
        beneficiaries: bens,
      }
      const exportJson = JSON.stringify(exportPayload, null, 2)
      const hashBuffer  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(exportJson))
      const hashHex     = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
      const finalExport = { ...exportPayload, _integrity: { sha256: hashHex, generated_at: new Date().toISOString() } }
      // Build human-readable HTML report
      const htmlEntries  = (exportPayload.vault_entries || [])
      const htmlBens     = (exportPayload.beneficiaries || [])
      const htmlProf     = exportPayload.profile || {}
      const htmlNotifs   = (exportPayload.notifications || [])
      const htmlDevs     = (exportPayload.device_log || [])
      const dateStr  = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
      const fmt      = d => d ? new Date(d).toLocaleDateString('en-GB') : ''

      const htmlReport = [
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">',
        '<title>Digital Relative - My Data Export</title>',
        '<style>body{font-family:-apple-system,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#333}',
        'h1{color:#0d1b2a;border-bottom:3px solid #c9a84c;padding-bottom:10px}h2{color:#0d1b2a;margin-top:28px;font-size:1.1rem}',
        'table{width:100%;border-collapse:collapse;margin:10px 0;font-size:.9rem}th{background:#0d1b2a;color:#c9a84c;padding:8px 12px;text-align:left}',
        'td{padding:8px 12px;border-bottom:1px solid #eee}.meta{background:#f9f7f2;padding:16px;border-radius:8px;margin:14px 0;font-size:.85rem}',
        '.note{color:#888;font-style:italic;font-size:.85rem}pre{font-size:.75rem;background:#f5f5f5;padding:16px;border-radius:8px;overflow:auto;max-height:300px}</style>',
        '</head><body>',
        '<h1>Digital Relative - My Personal Data Export</h1>',
        '<div class="meta">',
        '<b>Export date:</b> ' + dateStr + '<br>',
        '<b>Account:</b> ' + (user?.email || '') + '<br>',
        '<b>Plan:</b> ' + (htmlProf.plan || '') + '<br>',
        '<b>Member since:</b> ' + fmt(htmlProf.created_at) + '<br>',
        '<b>Integrity (SHA-256):</b> <span style="font-family:monospace;font-size:.75rem;word-break:break-all">' + hashHex + '</span>',
        '</div>',
        '<p class="note">Encrypted fields (username, password, notes, secure content, address) are end-to-end encrypted and cannot be included in plaintext. Only you can decrypt them with your vault PIN.</p>',
        '<h2>Vault Entries (' + htmlEntries.length + ')</h2>',
        '<table><tr><th>Title</th><th>Category</th><th>Created</th><th>Expiry</th></tr>',
        htmlEntries.map(e => '<tr><td>' + (e.title||'') + '</td><td>' + (e.category||'') + '</td><td>' + fmt(e.created_at) + '</td><td>' + (e.expiry_date||'') + '</td></tr>').join('') || '<tr><td colspan="4">None</td></tr>',
        '</table>',
        '<h2>Beneficiaries (' + htmlBens.length + ')</h2>',
        '<table><tr><th>Name</th><th>Email</th><th>Relation</th><th>Status</th><th>Executor</th></tr>',
        htmlBens.map(b => '<tr><td>' + (b.name||'') + '</td><td>' + (b.email||'') + '</td><td>' + (b.relation||'') + '</td><td>' + (b.status||'') + '</td><td>' + (b.is_executor?'Yes':'No') + '</td></tr>').join('') || '<tr><td colspan="5">None</td></tr>',
        '</table>',
        '<h2>Notifications (' + htmlNotifs.length + ')</h2>',
        '<table><tr><th>Date</th><th>Title</th></tr>',
        htmlNotifs.map(n => '<tr><td>' + fmt(n.created_at) + '</td><td>' + (n.title||'') + '</td></tr>').join('') || '<tr><td colspan="2">None</td></tr>',
        '</table>',
        '<h2>Device Sign-ins (' + htmlDevs.length + ')</h2>',
        '<table><tr><th>Date</th><th>IP Address</th><th>Device</th></tr>',
        htmlDevs.map(d => '<tr><td>' + fmt(d.created_at) + '</td><td>' + (d.ip_address||'') + '</td><td>' + (d.user_agent||'').slice(0,80) + '</td></tr>').join('') || '<tr><td colspan="3">None</td></tr>',
        '</table>',
        '<h2>Account Preferences</h2>',
        '<div class="meta">',
        '<b>Marketing opt-in:</b> ' + (htmlProf.marketing_opt_in?'Yes':'No') + '<br>',
        '<b>Language:</b> ' + (htmlProf.preferred_language||'en') + '<br>',
        '<b>Check-in every:</b> ' + (htmlProf.checkin_frequency_days||30) + ' days<br>',
        '<b>Last check-in:</b> ' + fmt(htmlProf.last_checkin) + '<br>',
        '<b>GDPR consent:</b> ' + fmt(htmlProf.gdpr_consent_at),
        '</div>',
        '<h2>Raw JSON Data</h2>',
        '<pre>' + JSON.stringify({ ...exportPayload, integrity_sha256: hashHex }, null, 2).replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>',
        '</body></html>',
      ].join('')

      const blob = new Blob([htmlReport], { type: 'text/html' })
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'digital-relative-export-' + new Date().toISOString().split('T')[0] + '.html' })
      a.click()
      toast.dismiss(id); toast.success('Data exported')
    } catch (e) { toast.dismiss(id); toast.error(e.message) }
  }

  async function handleDeleteAccount() {
    if (confirmDelete !== 'DELETE') { toast.error('Type DELETE to confirm'); return }
    if (deleteStep === 1) { setDeleteStep(2); return }
    // Step 2: re-authenticate before deletion
    const isOAuth = user?.app_metadata?.provider === 'google' || user?.app_metadata?.provider === 'apple'
    if (!isOAuth) {
      if (!deletePassword) { toast.error('Enter your password to confirm deletion'); return }
      // Re-authenticate with Supabase
      const { error: reAuthErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: deletePassword,
      })
      if (reAuthErr) { toast.error('Incorrect password - deletion cancelled'); setDeletePassword(''); return }
    }
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

      {/* MFA - show explanation for OAuth users */}
      {isOAuth && (
        <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Two-factor authentication</h3>
          <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
            You sign in with Google, so your two-factor authentication is managed by Google. To enable or manage 2FA, visit your <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>Google account security settings</a>.
          </p>
        </div>
      )}

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
        {/* Push notifications - shown always, button disabled if unsupported */}
        {(
          <div style={{ marginTop: 18 }}>
            <label className="label">Browser push notifications</label>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 8, lineHeight: 1.6 }}>
              Receive a reminder 3 days before your check-in is due, plus alerts for new device sign-ins. Works in Chrome, Edge, and Firefox on desktop and Android.
            </div>
            {!pushSupported ? (
              <div style={{ fontSize: 12, color: 'var(--text-sub)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                Push notifications are not supported in this browser. Try Chrome, Edge, or Firefox on desktop or Android.
              </div>
            ) : pushPermission === 'denied' ? (
              <div style={{ fontSize: 12, color: 'var(--danger)', padding: '8px 12px', background: 'rgba(224,82,82,0.08)', borderRadius: 8, border: '1px solid rgba(224,82,82,0.2)' }}>
                Blocked in browser. To enable, click the lock icon in the address bar and allow notifications for digitalrelative.co.uk.
              </div>
            ) : pushSubscribed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--success)' }}>Push notifications enabled</span>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={pushUnsubscribe} disabled={pushLoading}>Turn off</button>
              </div>
            ) : (
              <button className="btn-ghost" style={{ fontSize: 13 }} onClick={pushSubscribe} disabled={pushLoading}>
                {pushLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Enable push notifications'}
              </button>
            )}
          </div>
        )}

        {/* Mobile number for SMS reminders */}
        <div style={{ marginTop: 16 }}>
          <label className="label">Mobile number for SMS check-in reminders (optional)</label>
          <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 6 }}>
            International format e.g. +447911123456. Only used for check-in overdue reminders.
          </div>
          <input className="input" type="tel" placeholder="+44..."
            value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
        </div>

        <button className="btn-primary" style={{ fontSize: 13, marginTop: 14 }} onClick={savePreferences}>Save preferences</button>
      </div>

      {/* Trusted device */}
      <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Trusted device</h3>
        {deviceTrusted ? (
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 999, marginBottom: 10,
              fontSize: 11, fontWeight: 500,
              background: trustMode === 'prf' ? 'rgba(74,167,108,0.15)' : 'rgba(201,168,76,0.15)',
              color:      trustMode === 'prf' ? '#7dd49e' : 'var(--gold)',
              border: `1px solid ${trustMode === 'prf' ? 'rgba(74,167,108,0.35)' : 'rgba(201,168,76,0.35)'}`,
            }}>
              {trustMode === 'prf' ? '🔐 Biometric unlock' : '⚠️ Device-token unlock (legacy)'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.7 }}>
              {trustMode === 'prf'
                ? 'This device is trusted and your vault PIN is bound to your platform authenticator (Touch ID, Windows Hello, or similar). The key material never touches localStorage.'
                : 'This device is trusted via a legacy localStorage-bound key. On your next PIN entry we will offer to upgrade to biometric unlock — accept the Touch ID / Windows Hello prompt to migrate.'}
            </p>
            <button className="btn-danger" style={{ fontSize: 12 }} onClick={revokeTrustedDevice}>
              Remove trust from this device
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
            This device is not trusted. Tick "Trust this device" on the PIN entry screen to skip the PIN on future sign-ins.
          </p>
        )}
      </div>

      {/* Cookie preferences */}
      <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Cookie preferences</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.7 }}>
          {(() => {
            const c = (() => { try { return localStorage.getItem('dr_cookie_consent') } catch { return null } })()
            if (c === 'accepted') return 'You accepted non-essential cookies. The Crisp support chat widget is loaded.'
            if (c === 'rejected') return 'You declined non-essential cookies. Only strictly-necessary cookies are set. The Crisp chat widget is not loaded.'
            return "You haven't made a choice yet."
          })()}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => {
            try { localStorage.setItem('dr_cookie_consent', 'rejected') } catch {}
            toast.success('Non-essential cookies declined. Reload to apply.')
          }}>
            Reject non-essential
          </button>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => {
            try { localStorage.setItem('dr_cookie_consent', 'accepted') } catch {}
            window.dispatchEvent(new CustomEvent('dr_cookie_accepted'))
            toast.success('Non-essential cookies accepted')
          }}>
            Accept all
          </button>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => {
            try { localStorage.removeItem('dr_cookie_consent') } catch {}
            toast('Preference cleared — banner will reappear on next public page', { icon: 'ℹ️' })
          }}>
            Clear preference
          </button>
        </div>
      </div>

      {/* Duress PIN */}
      <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Duress PIN</h3>
        {showDuressSetup ? (
          <DuressPinSetup
            onComplete={() => { setShowDuressSetup(false); toast.success('Duress PIN active') }}
            onCancel={() => setShowDuressSetup(false)}
          />
        ) : profile?.duress_pin_set ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.7 }}>
              Your duress PIN is set. If you are ever coerced into revealing your PIN, give this one instead.
              The person will see a convincing decoy vault. You and our security team will receive a silent alert.
            </p>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowDuressSetup(true)}>
              Change duress PIN
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.7 }}>
              A second PIN that shows a fake vault if you are ever forced to reveal your PIN.
              Entering it sends a silent alert to you and our security team.
            </p>
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setShowDuressSetup(true)}>
              Set up duress PIN
            </button>
          </div>
        )}
      </div>

      {/* Vault PIN recovery codes */}
      <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Vault recovery codes</h3>
        {showRecoveryCodes ? (
          <GenerateRecoveryCodes
            onDone={() => setShowRecoveryCodes(false)}
            onCancel={() => setShowRecoveryCodes(false)}
          />
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 14 }}>
              If you forget your vault PIN, recovery codes are the only way to regain access to your vault.
              We cannot recover your data without them. Generate 8 one-time codes and store them somewhere safe.
            </p>
            <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowRecoveryCodes(true)}>
              Generate recovery codes
            </button>
          </div>
        )}
      </div>

      {/* Security keys and passkeys - available to all users */}
      {(
        <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
          {showWebAuthn ? (
            <WebAuthnSetup onDone={() => setShowWebAuthn(false)} onCancel={() => setShowWebAuthn(false)} />
          ) : (
            <div>
              <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Security keys and passkeys</h3>
              <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 14 }}>
                Register a hardware security key (YubiKey), Touch ID, or Windows Hello as a second factor. More phishing-resistant than OTP codes.
              </p>
              <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowWebAuthn(true)}>
                Manage security keys
              </button>
            </div>
          )}
        </div>
      )}

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

      {/* Audit log */}
      <div className="fade-up-4 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Recent activity</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.6 }}>
          A log of security-relevant actions on your account.
        </p>
        {auditLog.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>No activity recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {auditLog.map((entry, i) => {
              const label = {
                vault_entry_created:    '+ Vault entry added',
                vault_entry_updated:    '✎ Vault entry updated',
                vault_entry_deleted:    '× Vault entry deleted',
                beneficiary_added:      '+ Beneficiary added',
                beneficiary_removed:    '× Beneficiary removed',
                mfa_enabled:            '✓ Two-factor auth enabled',
                mfa_disabled:           '! Two-factor auth disabled',
                pin_changed:            '🔑 Vault PIN changed',
                shared_link_created:    '+ Shared link created',
                shared_link_revoked:    '× Shared link revoked',
                shared_link_accessed:   '👁 Shared link accessed',
                plan_changed:           '◇ Plan changed',
                gdpr_export:            '↓ Data exported',
                account_deleted:        '× Account deleted',
                password_changed:       '🔑 Password changed',
                device_trusted:         '✓ Device trusted',
                device_trust_revoked:   '! Device trust removed',
              }[entry.action] || entry.action?.replace(/_/g, ' ')
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--cream-dim)' }}>{label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-sub)', flexShrink: 0 }}>
                    {new Date(entry.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowContactModal(true)}>Contact data controller</button>
        </div>
      </div>

      {/* Contact data controller modal */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="modal" style={{ width: 480, maxWidth: '92vw' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>Contact the data controller</h2>
            <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 18 }}>
              Digital Relative is the data controller for all personal data stored in your vault. For data protection enquiries, subject access requests, or to exercise your GDPR rights, contact us at:
            </p>
            <div style={{ padding: '14px 16px', background: 'rgba(201,168,76,0.06)', border: '1px solid var(--gold-border)', borderRadius: 10, marginBottom: 18 }}>
              <div style={{ fontSize: 14, color: 'var(--cream)', fontWeight: 600, marginBottom: 4 }}>privacy@digitalrelative.co.uk</div>
              <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>We aim to respond within 5 working days</div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 20 }}>
              You can copy and paste the template below to make a subject access request:
            </p>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.8, marginBottom: 18, whiteSpace: 'pre-wrap' }}>
{`To: privacy@digitalrelative.co.uk
Subject: Subject Access Request

Dear Digital Relative,

I am writing to request a copy of all personal data you hold about me under Article 15 of the UK GDPR.

My account email address is: ${user?.email || '[your email address]'}

Please provide all data held about me, including vault metadata, account details, device logs, and any other personal information processed by Digital Relative.

Yours sincerely,
[Your name]`}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => {
                navigator.clipboard.writeText('privacy@digitalrelative.co.uk')
                  .then(() => toast.success('Email copied'))
                  .catch(() => {})
              }}>Copy email address</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => setShowContactModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

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
