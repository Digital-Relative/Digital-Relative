import { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useVaultLock } from './hooks/useVaultLock'
import { pinIsSet } from './lib/vaultPin'
import { hasSessionKey, restoreSessionKey } from './lib/crypto'
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
import AboutPage from './pages/AboutPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import BlogPage from './pages/BlogPage'
import './index.css'
import { isRTL } from './lib/i18n'

// Check if this is a beneficiary portal access
const isBeneficiaryRoute = window.location.pathname === '/beneficiary' &&
  new URLSearchParams(window.location.search).has('token')
const isShareRoute = window.location.pathname === '/share' && new URLSearchParams(window.location.search).has('t')
const isEmergencyRoute = window.location.pathname === '/emergency-access'
const isAdminRoute = window.location.pathname === '/admin/review'

function AppInner() {
  const { user, profile, loading, transitioning, signOut, fetchProfile } = useAuth()
  const { isLocked }      = useVaultLock()
  const [keyRestored, setKeyRestored] = useState(false)

  // Restore vault key from sessionStorage on every page load
  // This handles the case where Google OAuth redirects caused a page reload
  useEffect(() => {
    restoreSessionKey().then(restored => {
      if (restored) {
        setPinReady(true)  // key restored - treat as already unlocked
      }
      setKeyRestored(true)
    })
  }, [])

  // Reset pinReady if vault genuinely locks (2hr timeout)
  // isLocked comes from useVaultLock polling hasSessionKey() every 2s
  useEffect(() => {
    if (isLocked && pinReady) {
      setPinReady(false)
    }
  }, [isLocked])
  // Sync navigation with browser history so back/forward buttons work
  const getPageFromUrl = () => {
    const params = new URLSearchParams(window.location.search)
    return params.get('page') || 'dashboard'
  }
  const [page, setPageState] = useState(getPageFromUrl)

  const setPage = (newPage) => {
    if (newPage === page) return
    const url = newPage === 'dashboard' ? '/' : `/?page=${newPage}`
    window.history.pushState({ page: newPage }, '', url)
    setPageState(newPage)
  }

  // Set correct state on initial load so history entry is properly tagged
  useEffect(() => {
    const initialPage = getPageFromUrl()
    window.history.replaceState({ page: initialPage }, '', window.location.href)
  }, [])

  // Listen for browser back/forward button
  useEffect(() => {
    const handlePop = (e) => {
      const pg = e.state?.page || getPageFromUrl() || 'dashboard'
      setPageState(pg)
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])
  const [showAuth, setShowAuth]     = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [pinReady, setPinReady]     = useState(false)
  const [mfaVerified, setMfaVerified]   = useState(false)
  const [recoveryUsed, setRecoveryUsed]   = useState(false)

  // Reset showAuth when user logs in
  useEffect(() => {
    if (user && showAuth) setShowAuth(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('success')) {
      toast.success('Payment successful - welcome to your new plan!')
      setPage('plan')
      window.history.replaceState({}, '', '/')
      if (fetchProfile && user) {
        setTimeout(() => fetchProfile(user.id), 2000)
        setTimeout(() => fetchProfile(user.id), 5000)
      }
    }
    if (params.get('cancelled')) {
      toast('Payment cancelled - you have not been charged')
      window.history.replaceState({}, '', '/')
    }
    const denyRequestId = params.get('deny_request')
    if (denyRequestId && /^[0-9a-f-]{36}$/.test(denyRequestId)) {
      window.history.replaceState({}, '', '/')
      supabase.functions.invoke('emergency-access', {
          body: { action: 'owner_respond', requestId: denyRequestId, response: 'alive_deny' },
      }).then(({ error }) => {
          if (!error) {
            toast.success("We've recorded that you're well and denied the access request. Your check-in has been updated.", { duration: 8000 })
          } else {
            toast.error('Could not process denial - please contact support@digitalrelative.co.uk')
          }
        })
    }
  }, [user])

  // Apply language/RTL from profile
  useEffect(() => {
    const lang = profile?.preferred_language || 'en'
    document.documentElement.lang = lang
    document.documentElement.dir  = isRTL(lang) ? 'rtl' : 'ltr'
  }, [profile?.preferred_language])

  useEffect(() => {
    if (user && profile && pinIsSet(profile) && hasSessionKey()) {
      setPinReady(true)
      // Log device sign-in and alert if new device
      supabase.functions.invoke('device-log', {
        body: { userAgent: navigator.userAgent },
      }).catch(() => {}) // best-effort, never block the user
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

  // Checkout trigger - must be at top level, not inside renderPage
  useEffect(() => {
    // OAuth users skip MFA so treat pinReady as sufficient for them
    const _isOAuth = user?.app_metadata?.provider === 'google' || user?.app_metadata?.provider === 'apple'
    const readyForCheckout = pinReady && (mfaVerified || _isOAuth)
    if (selectedPlan && readyForCheckout && user) {
      setPage('plan')
      setTimeout(() => {
        const event = new CustomEvent('dr_trigger_checkout', { detail: selectedPlan })
        window.dispatchEvent(event)
        setSelectedPlan(null)
      }, 500)
    }
  }, [selectedPlan, pinReady, mfaVerified, user])

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
    const params = new URLSearchParams(window.location.search)
    if (params.get('signup') || params.get('login')) return <AuthPage />
    return <LandingPage
      onLogin={() => { setSelectedPlan(null); setShowAuth(true) }}
      onSignup={() => { setSelectedPlan(null); setShowAuth(true) }}
      onPlan={(planId, priceId) => { setSelectedPlan({ planId, priceId }); setShowAuth(true) }}
    />
  }

  if (profile && !pinIsSet(profile)) {
    return <VaultPinSetup onComplete={() => setPinReady(true)} />
  }

  if (!keyRestored) {
    // Wait for sessionStorage key restoration before deciding to show PIN prompt
    return null
  }

  if (profile && pinIsSet(profile) && !hasSessionKey() && !pinReady) {
    return <VaultPinEntry onUnlocked={() => setPinReady(true)} onSignOut={signOut} />
  }

  const isOAuthUser = user?.app_metadata?.provider === 'google' || user?.app_metadata?.provider === 'apple'
  if (!isOAuthUser && pinReady && !mfaVerified) {
    const hasMfaEnrolled = profile?.mfa_enrolled === true
    if (!hasMfaEnrolled) {
      return <MfaSetup onComplete={() => setMfaVerified(true)} onSignOut={signOut} />
    }
    return <MfaVerify onVerified={(opts) => { setMfaVerified(true); if (opts?.usedRecovery) setRecoveryUsed(true) }} onSignOut={signOut} />
  }

  const isBeneficiaryOnly = profile?.account_origin === 'beneficiary' && (!profile?.plan || profile?.plan === 'free')

  function renderPage() {
    switch(page) {
      case 'dashboard':     return <Dashboard onNav={setPage} />
      case 'vault':         return <VaultPage onNav={setPage} />
      case 'beneficiaries': return <BeneficiariesPage onNav={setPage} />
      case 'checkin':       return <CheckInPage />
      case 'afteriamgone':  return <AfterIAmGonePage />
      case 'documents':     return <DocumentsPage onNav={setPage} />
      case 'couples':       return <CouplesPage onNav={setPage} />
      case 'family':        return <FamilyPage />
      case 'sharedlinks':   return <SharedLinksPage />
      case 'plan':          return <PlanPage />
      case 'settings':      return <SettingsPage />
      case 'about':         return <AboutPage />
      case 'privacy':        return <PrivacyPage />
      case 'terms':          return <TermsPage />
      case 'blog':          return <BlogPage />
      default:              return <Dashboard onNav={setPage} />
    }
  }

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
        {renderPage()}
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
