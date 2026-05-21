import { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useVaultLock } from './hooks/useVaultLock'
import { pinIsSet } from './lib/vaultPin'
import { hasSessionKey } from './lib/crypto'
import { supabase } from './lib/supabase'
import Sidebar from './components/Sidebar'
import VaultLocked from './components/VaultLocked'
import VaultPinSetup from './components/VaultPinSetup'
import MfaSetup from './components/MfaSetup'
import MfaVerify from './components/MfaVerify'
import VaultPinEntry from './components/VaultPinEntry'
import ErrorBoundary from './components/ErrorBoundary'
import AuthPage from './pages/AuthPage'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import VaultPage from './pages/VaultPage'
import BeneficiariesPage from './pages/BeneficiariesPage'
import CheckInPage from './pages/CheckInPage'
import PlanPage from './pages/PlanPage'
import SettingsPage from './pages/SettingsPage'
import AfterIAmGonePage from './pages/AfterIAmGonePage'
import DocumentsPage from './pages/DocumentsPage'
import CouplesPage from './pages/CouplesPage'
import FamilyPage from './pages/FamilyPage'
import SharedLinkPage from './pages/SharedLinkPage'
import SharedLinksPage from './pages/SharedLinksPage'
import EmergencyAccessPage from './pages/EmergencyAccessPage'
import AdminReviewPage from './pages/AdminReviewPage'
import BeneficiaryPortal from './pages/BeneficiaryPortal'
import BeneficiaryDashboard from './pages/BeneficiaryDashboard'
import './index.css'

// Check if this is a beneficiary portal access
const isBeneficiaryRoute = window.location.pathname === '/beneficiary' ||
  (window.location.pathname !== '/share' && new URLSearchParams(window.location.search).has('token'))
const isShareRoute = window.location.pathname === '/share' && new URLSearchParams(window.location.search).has('t')
const isEmergencyRoute = window.location.pathname === '/emergency-access'
const isAdminRoute = window.location.pathname === '/admin/review'

function AppInner() {
  const { user, profile, loading, transitioning, signOut, fetchProfile } = useAuth()
  const { isLocked }      = useVaultLock()
  const [page, setPage]   = useState('dashboard')
  const [showAuth, setShowAuth]     = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null) // plan chosen from landing page pricing
  const [pinReady, setPinReady]     = useState(false)
  const [mfaVerified, setMfaVerified]   = useState(false)
  const [recoveryUsed, setRecoveryUsed]   = useState(false)

  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('success')) {
      toast.success('Payment successful — welcome to your new plan!')
      setPage('plan')
      window.history.replaceState({}, '', '/')
      // Re-fetch profile after a short delay to pick up plan change from webhook
      if (fetchProfile && user) {
        setTimeout(() => fetchProfile(user.id), 2000)
        setTimeout(() => fetchProfile(user.id), 5000) // second attempt in case webhook is slow
      }
    }
    if (params.get('cancelled')) {
      toast('Payment cancelled — you have not been charged')
      window.history.replaceState({}, '', '/')
    }
    // FIX BL-EA-2: Handle "I'm alive — deny access" link from emergency access email
    const denyRequestId = params.get('deny_request')
    if (denyRequestId && /^[0-9a-f-]{36}$/.test(denyRequestId)) {
      window.history.replaceState({}, '', '/')
      // Call the edge function to record owner is alive and deny the request
      // FIX BL-1: use statically imported supabase — dynamic import loses session state
      supabase.functions.invoke('emergency-access', {
          body: { action: 'owner_respond', requestId: denyRequestId, response: 'alive_deny' },
      }).then(({ error }) => {
          if (!error) {
            toast.success("We've recorded that you're well and denied the access request. Your check-in has been updated.", { duration: 8000 })
          } else {
            toast.error('Could not process denial — please contact support@digitalrelative.co.uk')
          }
        })
    }
  }, [user])

  // Check if session key is present
  useEffect(() => {
    if (user && profile && pinIsSet(profile) && hasSessionKey()) {
      setPinReady(true)
      // Check for pending plan from landing page signup flow
      const pendingPlan = sessionStorage.getItem('dr_pending_plan')
      if (pendingPlan) {
        try {
          const plan = JSON.parse(pendingPlan)
          sessionStorage.removeItem('dr_pending_plan')
          setSelectedPlan(plan)
        } catch {}
      }
    } else {
      setPinReady(false)
      setMfaVerified(false)
    }
  }, [user, profile])

  if (loading || transitioning) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--gold)', marginBottom: 16 }}>Digital Relative</div>
          <span className="spinner" />
        </div>
      </div>
    )
  }

  if (!user) {
    if (showAuth) return <AuthPage onBack={() => setShowAuth(false)} selectedPlan={selectedPlan} onClearPlan={() => setSelectedPlan(null)} />
    // Show landing page to unauthenticated visitors
    // Check if they came via a direct auth link (signup=true param)
    const params = new URLSearchParams(window.location.search)
    if (params.get('signup') || params.get('login')) return <AuthPage />
    return <LandingPage
      onLogin={() => { setSelectedPlan(null); setShowAuth(true) }}
      onSignup={() => { setSelectedPlan(null); setShowAuth(true) }}
      onPlan={(planId, priceId) => { setSelectedPlan({ planId, priceId }); setShowAuth(true) }}
    />
  }

  // Profile loaded but PIN not yet set — first time setup
  if (profile && !pinIsSet(profile)) {
    return <VaultPinSetup onComplete={() => setPinReady(true)} />
  }

  // PIN is set but not entered this session — need PIN entry
  if (profile && pinIsSet(profile) && !hasSessionKey()) {
    return <VaultPinEntry onUnlocked={() => setPinReady(true)} onSignOut={signOut} />
  }

  // MFA enforcement — email/password users only (OAuth providers handle their own auth)
  const isOAuthUser = user?.app_metadata?.provider === 'google' || user?.app_metadata?.provider === 'apple'
  if (!isOAuthUser && pinReady && !mfaVerified) {
    // Check if MFA is enrolled
    const hasMfaEnrolled = profile?.mfa_enrolled === true
    if (!hasMfaEnrolled) {
      // First time — force MFA setup
      return <MfaSetup onComplete={() => setMfaVerified(true)} onSignOut={signOut} />
    }
    // MFA enrolled — verify it this session
    return <MfaVerify onVerified={(opts) => { setMfaVerified(true); if (opts?.usedRecovery) setRecoveryUsed(true) }} onSignOut={signOut} />
  }

  // Beneficiary-origin users with no own vault see the beneficiary dashboard
  // but can access their own vault pages too if they upgrade
  const isBeneficiaryOnly = profile?.account_origin === 'beneficiary' && (!profile?.plan || profile?.plan === 'free')

  const pages = {
    dashboard:     <Dashboard onNav={setPage} />,
    vault:         <VaultPage onNav={setPage} />,
    beneficiaries: <BeneficiariesPage onNav={setPage} />,
    checkin:       <CheckInPage />,
    afteriamgone:  <AfterIAmGonePage />,
    documents:     <DocumentsPage onNav={setPage} />,
    couples:       <CouplesPage onNav={setPage} />,
    family:        <FamilyPage />,
    sharedlinks:   <SharedLinksPage />,
    plan:          <PlanPage />,
    settings:      <SettingsPage />,
  }

  // If a plan was selected from landing page, trigger checkout after vault is ready
  useEffect(() => {
    if (selectedPlan && pinReady && mfaVerified && user) {
      // Go to plan page and trigger checkout
      setPage('plan')
      // Small delay to let plan page mount, then trigger checkout
      setTimeout(() => {
        const event = new CustomEvent('dr_trigger_checkout', { detail: selectedPlan })
        window.dispatchEvent(event)
        setSelectedPlan(null)
      }, 500)
    }
  }, [selectedPlan, pinReady, mfaVerified, user])

  return (
    <div className="layout">
      {isLocked && pinReady && <VaultLocked />}
      <Sidebar active={page} onNav={setPage} />
      <main className="main-content fade-in">
        {recoveryUsed && (
          <div style={{ background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)', borderRadius: 'var(--r)', padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cream)', marginBottom: 3 }}>You signed in with a recovery code</div>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.6 }}>Your 2FA device may be lost or unavailable. Set up a new method to keep your account secure.</div>
            </div>
            <button className="btn-primary" onClick={() => setPage('settings')} style={{ flexShrink: 0, fontSize: 13, padding: '8px 16px' }}>
              Set up 2FA →
            </button>
          </div>
        )}
        {pages[page] || pages.dashboard}
      </main>
    </div>
  )
}

export default function App() {
  if (isEmergencyRoute) {
    return (
      <ErrorBoundary>
        <EmergencyAccessPage />
      </ErrorBoundary>
    )
  }

  if (isAdminRoute) {
    return (
      <ErrorBoundary>
        <AdminReviewPage />
      </ErrorBoundary>
    )
  }

  // Shared link page — zero-knowledge recipient view
  if (isShareRoute) {
    return (
      <ErrorBoundary>
        <SharedLinkPage />
      </ErrorBoundary>
    )
  }

  // Beneficiary portal — completely separate from main app
  if (isBeneficiaryRoute) {
    return (
      <ErrorBoundary>
        <BeneficiaryPortal />
        <Toaster position="bottom-right" toastOptions={{
          style: { background: '#0f1e30', color: '#dde5ee', border: '1px solid rgba(255,255,255,0.1)', fontFamily: "'DM Sans',sans-serif", fontSize: 13 },
        }} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppInner />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: '#0f1e30', color: '#dde5ee', border: '1px solid rgba(255,255,255,0.1)', fontFamily: "'DM Sans',sans-serif", fontSize: 13 },
            success: { iconTheme: { primary: '#4caf82', secondary: '#0f1e30' } },
            error:   { iconTheme: { primary: '#e05252', secondary: '#0f1e30' } },
          }}
        />
      </AuthProvider>
    </ErrorBoundary>
  )
}
