import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

interface FamilyRow {
  id: string; name: string; plan: string; monthly_limit: number; members: number; letters: number
  used_this_month: number; owner_email: string | null; created_at: string
}
interface CodeRow { code: string; note: string | null; created_at: string; used_at: string | null; family_name: string | null }

const PLAN_LABEL: Record<string, string> = { trial: '试用', free: '免费', paid: '付费', suspended: '已停用' }

/** 平台管理员:发放开通码、查看各家庭用量、调整额度 / 停用。数据库端也会校验管理员身份。 */
export default function AdminPage() {
  const [families, setFamilies] = useState<FamilyRow[]>([])
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [count, setCount] = useState(1)
  const [note, setNote] = useState('')
  const [fresh, setFresh] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [showUsed, setShowUsed] = useState(false)

  const load = useCallback(async () => {
    const [f, c] = await Promise.all([supabase.rpc('admin_list_families'), supabase.rpc('admin_list_codes')])
    if (f.error || c.error) return setErr((f.error ?? c.error)!.message)
    setFamilies(f.data as FamilyRow[]); setCodes(c.data as CodeRow[])
  }, [])
  useEffect(() => { void load() }, [load])

  async function generate(e: FormEvent) {
    e.preventDefault(); setErr('')
    const { data, error } = await supabase.rpc('admin_create_codes', { how_many: count, note: note || null })
    if (error) return setErr(error.message)
    setFresh(data as string[]); setNote(''); void load()
  }

  async function update(f: FamilyRow, plan: string, limit: number) {
    const { error } = await supabase.rpc('admin_update_family', { fid: f.id, new_plan: plan, new_limit: limit })
    if (error) setErr(error.message); else void load()
  }

  function share(c: string) {
    const text = `你好!这是「家庭信件管家」的开通码:${c}\n打开 ${window.location.origin} ,用你的邮箱登录后输入开通码,就能创建你家的空间。`
    if (navigator.share) void navigator.share({ text }).catch(() => {})
    else void navigator.clipboard.writeText(text)
  }

  const unused = codes.filter((c) => !c.used_at)
  const totalUsed = families.reduce((s, f) => s + f.used_this_month, 0)

  return (
    <div className="stack">
      <h2>平台管理</h2>
      {err && <p className="error">{err}</p>}

      <section className="card stack">
        <h3>发放开通码</h3>
        <p className="muted small">每个码只能用一次,用来创建一个新家庭。被邀请的家人不需要码。</p>
        <form onSubmit={generate} className="row wrap">
          <label style={{ width: 90 }}>数量
            <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <label className="grow">备注(发给谁)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如:Tan 一家" />
          </label>
          <button style={{ alignSelf: 'flex-end' }}>生成</button>
        </form>
        {fresh.length > 0 && (
          <div className="summary">
            新开通码:{fresh.map((c) => (
              <div key={c} className="row between"><code className="bigcode">{c}</code><button className="link" onClick={() => share(c)}>分享 / 复制</button></div>
            ))}
          </div>
        )}
        <details open={unused.length > 0 && unused.length <= 10}>
          <summary>未使用的码({unused.length})</summary>
          {unused.map((c) => (
            <div key={c.code} className="row between small">
              <span><code>{c.code}</code> <span className="muted">{c.note}</span></span>
              <button className="link" onClick={() => share(c.code)}>分享 / 复制</button>
            </div>
          ))}
        </details>
        <label className="check small">
          <input type="checkbox" checked={showUsed} onChange={(e) => setShowUsed(e.target.checked)} />显示已用的码
        </label>
        {showUsed && codes.filter((c) => c.used_at).map((c) => (
          <div key={c.code} className="small muted"><code>{c.code}</code> → {c.family_name ?? '(家庭已删除)'} · {c.used_at?.slice(0, 10)}</div>
        ))}
      </section>

      <section className="card stack">
        <div className="row between">
          <h3>家庭({families.length})</h3>
          <span className="muted small">本月共分析 {totalUsed} 封</span>
        </div>
        <table className="letters admin">
          <thead><tr><th>家庭</th><th>成员 / 信件</th><th>本月用量</th><th>方案</th><th>每月上限</th></tr></thead>
          <tbody>
            {families.map((f) => (
              <tr key={f.id} className={f.plan === 'suspended' ? 'done' : ''}>
                <td data-label="家庭"><b>{f.name}</b><div className="muted small">{f.owner_email}</div></td>
                <td data-label="成员 / 信件">{f.members} 人 · {f.letters} 封</td>
                <td data-label="本月用量" className={f.used_this_month >= f.monthly_limit ? 'overdue' : ''}>
                  {f.used_this_month} / {f.monthly_limit}
                </td>
                <td data-label="方案">
                  <select value={f.plan} onChange={(e) => update(f, e.target.value, f.monthly_limit)}>
                    {Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td data-label="每月上限">
                  <input type="number" min={0} defaultValue={f.monthly_limit} style={{ width: 90 }}
                    onBlur={(e) => { const n = Number(e.target.value); if (n >= 0 && n !== f.monthly_limit) void update(f, f.plan, n) }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
