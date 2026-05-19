import { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import VaultPage from './pages/VaultPage'
import BeneficiariesPage from './pages/BeneficiariesPage'
import CheckInPage from './pages/CheckInPage'
import PlanPage from './pages/PlanPage'
import SettingsPage from './pages/SettingsPage'
import './index.css'

function AppInner() {
  const { user, loading } = useAuth()
  const [page, setPage] = useState('dashboard')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success')) {
      toast.success('Payment successful — welcome to your new plan!')
      setPage('plan')
      window.history.replaceState({}, '', '/')
    }
    if (params.get('cancelled')) {
      toast('Payment cancelled')
      window.history.replaceState({}, '', '/')
    }
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--gold)', marginBottom: 16 }}>Legatum</div>
          <span className="spinner" />
        </div>
      </div>
    )
  }

  if (!user) return <AuthPage />

  const pages = {
    dashboard:     <Dashboard onNav={setPage} />,
    vault:         <VaultPage onNav={setPage} />,
    beneficiaries: <BeneficiariesPage onNav={setPage} />,
    checkin:       <CheckInPage />,
    plan:          <PlanPage />,
    settings:      <SettingsPage />,
  }

  return (
    <div className="layout">
      <Sidebar active={page} onNav={setPage} />
      <main className="main-content fade-in">
        {pages[page] || pages.dashboard}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0f1e30',
            color: '#dde5ee',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
          },
          success: { iconTheme: { primary: '#4caf82', secondary: '#0f1e30' } },
          error:   { iconTheme: { primary: '#e05252', secondary: '#0f1e30' } },
        }}
      />
    </AuthProvider>
  )
}
