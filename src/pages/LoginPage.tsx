import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { LangSwitcher, useI18n, type T } from '../lib/i18n'
import { IconMail } from '../components/Icons'

function friendly(t: T, msg: string): string {
  if (/rate limit|too many/i.test(msg)) return t('login.rateLimited')
  return msg
}

// Google 登录需要先在 Supabase 后台配置,配置好后设 VITE_ENABLE_GOOGLE=true 打开按钮
const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE === 'true'

export default function LoginPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setErr(friendly(t, error.message)); else setSent(true)
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin },
    })
    if (error) setErr(friendly(t, error.message))
  }

  return (
    <div className="auth">
    <div className="auth-lang"><LangSwitcher /></div>
    <div className="auth-hero appear" style={{ ['--i' as string]: 0 }}>
      <div className="app-icon" aria-hidden><IconMail width={34} height={34} strokeWidth={1.6} /></div>
      <h1 className="display">{t('app.name')}</h1>
      <p className="muted lead">{t('app.tagline')}</p>
    </div>
    <div className="card narrow appear" style={{ ['--i' as string]: 1 }}>
      {sent ? (
        <div className="stack">
          <p className="summary">✅ {t('login.sent', { email })}</p>
          <button className="link" onClick={() => setSent(false)}>{t('login.useOther')}</button>
        </div>
      ) : (
        <form onSubmit={sendLink} className="stack">
          <label>{t('login.email')}
            <input type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" />
          </label>
          <button disabled={busy}>{busy ? t('login.sending') : t('login.send')}</button>
          <p className="muted small">{t('login.noPassword')}</p>
        </form>
      )}
      {GOOGLE_ENABLED && (<>
        <div className="divider">{t('login.or')}</div>
        <button className="secondary" onClick={google}>{t('login.google')}</button>
      </>)}
      {err && <p className="error">{err}</p>}
    </div>
      <ul className="hints small muted appear" style={{ ['--i' as string]: 2 }}>
        <li>{t('login.invitedHint')}</li>
        <li>{t('login.newHint')}</li>
      </ul>
    </div>
  )
}
