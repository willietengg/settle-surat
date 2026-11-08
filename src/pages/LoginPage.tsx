import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// 仅限邀请:未被邀请的邮箱在数据库层被拒绝,Supabase 返回 "Database error saving new user"
function friendly(msg: string): string {
  if (/database error|not_invited|signup/i.test(msg)) {
    return '这个邮箱还没有被邀请。请让家人在 App 的「家人」页面先添加你的邮箱,再来登录。'
  }
  if (/rate limit/i.test(msg)) return '发送太频繁了,请过几分钟再试。'
  return msg
}

// Google 登录需要先在 Supabase 后台配置,配置好后设 VITE_ENABLE_GOOGLE=true 打开按钮
const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE === 'true'

export default function LoginPage() {
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
    if (error) setErr(friendly(error.message)); else setSent(true)
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin },
    })
    if (error) setErr(friendly(error.message))
  }

  return (
    <div className="center card narrow">
      <h1>📬 家庭信件管家</h1>
      <p className="muted">拍照或上传家里的信,自动整理重点。只有你们家的成员能看到内容。</p>
      {sent ? (
        <p>✅ 登录链接已发到 <b>{email}</b>,请在这台手机上打开邮件并点击链接。</p>
      ) : (
        <form onSubmit={sendLink} className="stack">
          <label>邮箱
            <input type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" />
          </label>
          <button disabled={busy}>{busy ? '发送中…' : '发送登录链接'}</button>
        </form>
      )}
      {GOOGLE_ENABLED && (<>
        <div className="divider">或</div>
        <button className="secondary" onClick={google}>使用 Google 登录</button>
      </>)}
      {err && <p className="error">{err}</p>}
      <p className="muted small">仅限受邀家人使用。请用家人帮你登记的那个邮箱登录,会自动加入家庭。</p>
    </div>
  )
}
