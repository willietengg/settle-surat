import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp, useSession } from './context'
import { supabase } from './lib/supabase'
import { LangSwitcher, useI18n } from './lib/i18n'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import InvitationPage from './pages/InvitationPage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import LetterDetailPage from './pages/LetterDetailPage'
import ManagePage from './pages/ManagePage'
import AdminPage from './pages/AdminPage'

function Shell() {
  const { family, isPlatformAdmin } = useApp()
  const { t } = useI18n()
  return (
    <div className="shell">
      <header className="topbar">
        <strong className="brand">📬 {family.name}</strong>
        <nav>
          <NavLink to="/" end>{t('nav.dashboard')}</NavLink>
          <NavLink to="/manage">{t('nav.manage')}</NavLink>
          {isPlatformAdmin && <NavLink to="/admin">{t('nav.admin')}</NavLink>}
          <button className="link" onClick={() => supabase.auth.signOut()}>{t('nav.logout')}</button>
          <LangSwitcher />
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/letters/:id" element={<LetterDetailPage />} />
          <Route path="/manage" element={<ManagePage tab="family" />} />
          <Route path="/manage/address" element={<ManagePage tab="address" />} />
          {isPlatformAdmin && <Route path="/admin" element={<AdminPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const { session, ready } = useSession()
  const { t } = useI18n()

  if (!ready) return <div className="center muted">{t('common.loading')}</div>
  if (!session) return <LoginPage />

  return (
    <AppProvider
      session={session}
      fallback={(g, reload) =>
        g.state === 'loading' ? <div className="center muted">{t('common.loading')}</div>
        : g.state === 'no-family' ? <SetupPage onDone={reload} />
        : g.state === 'invited' ? <InvitationPage invitations={g.invitations} onDone={reload} />
        : (
          <div className="center card">
            <h2>{t('common.errorTitle')}</h2>
            <p>{g.message}</p>
            <button onClick={reload}>{t('common.retry')}</button>
          </div>
        )
      }
    >
      <Shell />
    </AppProvider>
  )
}
