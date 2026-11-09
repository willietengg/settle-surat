import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { PillNav, type PillItem } from './components/PillNav'
import { IconInbox, IconLogout, IconPeople, IconShield } from './components/Icons'
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

/** 顶栏滚动后才显示分隔(scroll edge effect),而不是一直有一条硬边线 */
function useScrolled() {
  const [s, setS] = useState(false)
  useEffect(() => {
    const on = () => setS(window.scrollY > 4)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return s
}

function Shell() {
  const { family, isPlatformAdmin } = useApp()
  const { t } = useI18n()
  const { pathname } = useLocation()
  const scrolled = useScrolled()
  const items: PillItem[] = [
    { to: '/', end: true, label: t('nav.dashboard'), icon: <IconInbox /> },
    { to: '/manage', label: t('nav.manage'), icon: <IconPeople /> },
    ...(isPlatformAdmin ? [{ to: '/admin', label: t('nav.admin'), icon: <IconShield /> }] : []),
  ]
  // 同一区块内(如 Manage 的两个分页)切换不重播页面进场动画
  const section = pathname.split('/')[1] || 'home'
  useEffect(() => { window.scrollTo({ top: 0 }) }, [section])

  return (
    <div className="shell">
      <header className="topbar glass" data-scrolled={scrolled}>
        <strong className="brand"><span className="brand-mark">✉︎</span><span className="ellipsis">{family.name}</span></strong>
        <PillNav items={items} className="desktop-only" />
        <div className="row tight">
          <LangSwitcher />
          <button className="iconbtn" aria-label={t('nav.logout')} title={t('nav.logout')} onClick={() => supabase.auth.signOut()}>
            <IconLogout />
          </button>
        </div>
      </header>
      <main key={section} className="page">
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
      <PillNav items={items} className="tabbar glass mobile-only" />
    </div>
  )
}

export default function App() {
  const { session, ready } = useSession()
  const { t } = useI18n()

  if (!ready) return <div className="center muted fade-in">{t('common.loading')}</div>
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
