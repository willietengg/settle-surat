import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function SetupPage({ onDone }: { onDone: () => void }) {
  const [familyName, setFamilyName] = useState('我们家')
  const [myName, setMyName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('create_family', { family_name: familyName.trim(), my_name: myName.trim() })
    setBusy(false)
    if (error) setErr(error.message); else onDone()
  }

  return (
    <div className="center card narrow">
      <h2>创建你的家庭</h2>
      <p className="muted">
        如果你是被家人邀请的,请先退出,用<b>对方填写的邮箱</b>重新登录,就会自动加入,不需要在这里创建。
      </p>
      <form onSubmit={submit} className="stack">
        <label>家庭名称
          <input required value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
        </label>
        <label>你的名字(要和信封上的写法接近,例如 Willie Teng)
          <input required value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Willie Teng" />
        </label>
        <button disabled={busy}>{busy ? '创建中…' : '创建'}</button>
      </form>
      {err && <p className="error">{err}</p>}
      <button className="link" onClick={() => supabase.auth.signOut()}>退出登录</button>
    </div>
  )
}
