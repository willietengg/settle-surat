import { useState, type FormEvent } from 'react'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import type { Member } from '../lib/types'

export default function MembersPage() {
  const { members, me, family, refreshMembers } = useApp()
  const isAdmin = me.role === 'admin'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(''); setMsg('')
    const addr = email.trim().toLowerCase()
    const { error } = await supabase.from('members').insert({
      family_id: family.id, display_name: name.trim(), email: addr || null,
    })
    if (error) { setErr(error.message.includes('duplicate') ? '这个邮箱已经在家庭里了' : error.message); setBusy(false); return }
    if (addr) {
      // 发一封登录邮件给对方:点链接即登录,并自动加入本家庭
      const r = await supabase.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: window.location.origin } })
      setMsg(r.error ? `已添加,但邮件发送失败(${r.error.message}),请让对方直接打开网站并用该邮箱登录。` : `已添加,并向 ${addr} 发送了登录链接。`)
    } else {
      setMsg('已添加(没有邮箱的家人只用于识别信件收件人,比如小孩)。')
    }
    setName(''); setEmail(''); setBusy(false)
    await refreshMembers()
  }

  async function saveAliases(m: Member, text: string) {
    const aliases = text.split(/[,,;;\n]/).map((s) => s.trim()).filter(Boolean)
    const { error } = await supabase.from('members').update({ aliases }).eq('id', m.id)
    if (error) setErr(error.message); else await refreshMembers()
  }

  async function remove(m: Member) {
    if (!confirm(`移除 ${m.display_name}?`)) return
    const { error } = await supabase.from('members').delete().eq('id', m.id)
    if (error) setErr(error.message); else await refreshMembers()
  }

  return (
    <div className="stack">
      <h2>家人</h2>
      <p className="muted">
        信件收件人如果不在这个名单里(或别名里),会显示 ⚠️ 警告。把信上常见的写法(缩写、中文名、旧名字)加到「别名」可以减少误报。
      </p>
      <ul className="members">
        {members.map((m) => (
          <li key={m.id} className="card stack">
            <div className="row between">
              <div>
                <b>{m.display_name}</b> {m.role === 'admin' && <span className="chip">管理员</span>}
                <div className="muted small">
                  {m.email ?? '无邮箱'} · {m.user_id ? '已加入' : m.email ? '等待对方登录' : '仅用于识别'}
                </div>
              </div>
              {isAdmin && m.id !== me.id && <button className="link danger-text" onClick={() => remove(m)}>移除</button>}
            </div>
            <label className="small">别名(用逗号分隔)
              <input defaultValue={m.aliases.join(', ')} disabled={!isAdmin} placeholder="例如:W. Teng, 陈大文"
                onBlur={(e) => { if (isAdmin && e.target.value !== m.aliases.join(', ')) void saveAliases(m, e.target.value) }} />
            </label>
          </li>
        ))}
      </ul>

      {isAdmin ? (
        <form onSubmit={add} className="card stack">
          <h3>添加家人</h3>
          <label>名字(尽量和信封上的一致)
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Mary Chan" />
          </label>
          <label>邮箱(Gmail 等,可留空)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mary@gmail.com" />
          </label>
          <button disabled={busy}>{busy ? '添加中…' : email ? '添加并发送邀请' : '添加'}</button>
        </form>
      ) : <p className="muted">只有管理员可以添加或移除家人。</p>}
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  )
}
