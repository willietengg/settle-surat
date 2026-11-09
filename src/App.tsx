import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp, useSession } from './context'
import { configured, supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import LettersPage from './pages/LettersPage'
import UploadPage from './pages/UploadPage'
import LetterDetailPage from './pages/LetterDetailPage'
import MembersPage from './pages/MembersPage'
import AdminPage from './pages/AdminPage'

function Shell() {
  const { family, isPlatformAdmin } = useApp()
  return (
    <div className="shell">
      <header className="topbar">
        <strong>📬 {family.name}</strong>
        <nav>
          <NavLink to="/" end>信件</NavLink>
          <NavLink to="/members">家人</NavLink>
          {isPlatformAdmin && <NavLink to="/admin">管理</NavLink>}
          <button className="link" onClick={() => supabase.auth.signOut()}>退出</button>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<LettersPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/letters/:id" element={<LetterDetailPage />} />
          <Route path="/members" element={<MembersPage />} />
          {isPlatformAdmin && <Route path="/admin" element={<AdminPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const { session, ready } = useSession()

  if (!configured) {
    return (
      <div className="center card">
        <h2>还没有配置 Supabase</h2>
        <p>复制 <code>.env.example</code> 为 <code>.env</code>,填入 <code>VITE_SUPABASE_URL</code> 和 <code>VITE_SUPABASE_ANON_KEY</code>,然后重启。详见 README。</p>
      </div>
    )
  }
  if (!ready) return <div className="center muted">加载中…</div>
  if (!session) return <LoginPage />

  return (
    <AppProvider
      session={session}
      fallback={({ state, message, reload }) =>
        state === 'loading' ? <div className="center muted">加载中…</div>
        : state === 'no-family' ? <SetupPage onDone={reload} />
        : <div className="center card"><h2>出错了</h2><p>{message}</p><button onClick={reload}>重试</button></div>
      }
    >
      <Shell />
    </AppProvider>
  )
}
