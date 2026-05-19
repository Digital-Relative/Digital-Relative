import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const { user, profile, updateProfile, signOut } = useAuth()
  const [name, setName]         = useState(profile?.full_name || '')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState('')

  async function handleSaveName() {
    setSaving(true)
    try {
      await updateProfile({ full_name: name })
      toast.success('Name updated')
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleExportData() {
    toast.loading('Preparing your data export…')
    try {
      // Fetch all user data
      const [{ data: entries }, { data: bens }, { data: prof }] = await Promise.all([
        supabase.from('vault_entries').select('*').eq('user_id', user.id),
        supabase.from('beneficiaries').select('*').eq('user_id', user.id),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
      ])
      const exportData = {
        exported_at: new Date().toISOString(),
        gdpr_note: 'This export contains all personal data held by Legatum for your account.',
        profile: prof,
        vault_entries: entries,
        beneficiaries: bens,
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url; a.download = `legatum-export-${Date.now()}.json`; a.click()
      URL.revokeObjectURL(url)
      toast.dismiss(); toast.success('Data exported')
    } catch (e) {
      toast.dismiss(); toast.error(e.message)
    }
  }

  async function handleDeleteAccount() {
    if (confirmDelete !== 'DELETE') { toast.error('Type DELETE to confirm'); return }
    setDeleting(true)
    try {
      // Delete all data via Supabase Edge Function (handles cascade)
      await supabase.functions.invoke('delete-account', { body: { userId: user.id } })
      toast.success('Account deleted')
      await signOut()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="fade-up page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Manage your account and data.</p>
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
        <button className="btn-primary" onClick={handleSaveName} disabled={saving}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save changes'}
        </button>
      </div>

      {/* Security */}
      <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Security</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 14 }}>
          Your vault is encrypted with AES-256-GCM using a key derived from your password. Even Legatum cannot read your vault contents. If you change your password, your vault will need to be re-encrypted on your next login.
        </p>
        <button className="btn-ghost" style={{ fontSize: 12 }}
          onClick={async () => {
            await supabase.auth.resetPasswordForEmail(user.email)
            toast.success('Password reset email sent')
          }}>
          Send password reset email
        </button>
      </div>

      {/* GDPR */}
      <div className="fade-up-4 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Your data (GDPR)</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 14 }}>
          Under GDPR Article 20, you have the right to receive a copy of all data we hold about you. Your data is stored in the EU and is never sold to third parties.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={handleExportData}>
            Export all my data (JSON)
          </button>
          <button className="btn-ghost" style={{ fontSize: 12 }}
            onClick={() => toast('Contact privacy@legatum.app for data queries', { icon: '✉️' })}>
            Contact data controller
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="fade-up-4 card-static" style={{ borderColor: 'rgba(224,82,82,0.25)' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--danger)', marginBottom: 8 }}>Delete account</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 14 }}>
          This will permanently delete your account, all vault entries, beneficiary records, and uploaded files. This action cannot be undone.
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
