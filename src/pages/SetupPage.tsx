import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function SetupPage({ onDone }: { onDone: () => void }) {
  const [familyName, setFamilyName] = useState('')
  const [myName, setMyName] = useState('')
  const [code, setCode] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void supabase.rpc('is_platform_admin').then(({ data }) => setIsAdmin(data === true))
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ''))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('create_family', {
      family_name: familyName.trim(), my_name: myName.trim(), invite_code: code.trim() || null,
    })
    setBusy(false)
    if (!error) return onDone()
    setErr(/INVALID_CODE/.test(error.message) ? '开通码无效或已被使用,请检查后再试。' : error.message)
  }

  return (
    <div className="center card narrow">
      <h2>创建你的家庭</h2>
      <p className="muted small">已登录:{email}</p>
      <div className="summary small">
        <b>是被家人邀请的?</b>不用在这里创建。请确认你登录的邮箱就是家人帮你登记的那个
        (不同的邮箱会被当成新用户)。邀请后需要<b>重新打开</b>本页面才会生效。
        <div><button className="link" onClick={onDone}>我已被邀请,重新检查</button></div>
      </div>
      <form onSubmit={submit} className="stack">
        <label>开通码{isAdmin && '(你是平台管理员,可留空)'}
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="例如 P58Q-GUAP" required={!isAdmin} autoCapitalize="characters" autoComplete="off" />
        </label>
        <label>家庭名称
          <input required value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="例如:Teng 一家" />
        </label>
        <label>你的名字(尽量和信封上的写法一致,例如 Willie Teng)
          <input required value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Willie Teng" />
        </label>
        <button disabled={busy}>{busy ? '创建中…' : '创建家庭'}</button>
      </form>
      {err && <p className="error">{err}</p>}
      <p className="muted small">没有开通码?请联系平台管理员获取。</p>
      <button className="link" onClick={() => supabase.auth.signOut()}>退出登录</button>
    </div>
  )
}
