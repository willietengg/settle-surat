import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import type { Category, Letter } from '../lib/types'
import { CATEGORIES, CATEGORY_LABEL, daysUntil, dueLabel, formatMoney } from '../lib/labels'

export default function LettersPage() {
  const { family, me, members } = useApp()
  const [letters, setLetters] = useState<Letter[]>([])
  const [recips, setRecips] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [cat, setCat] = useState<Category | ''>('')
  const [onlyImportant, setOnlyImportant] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)
  const [hideDone, setHideDone] = useState(true)
  const [q, setQ] = useState('')
  const [usage, setUsage] = useState<{ used: number; monthly_limit: number; plan: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('letters').select('*')
      .eq('family_id', family.id).order('created_at', { ascending: false })
    if (error) { setErr(error.message); setLoading(false); return }
    const rows = data as Letter[]
    setLetters(rows)
    const u = await supabase.rpc('get_family_usage', { fid: family.id })
    if (!u.error && u.data?.length) setUsage(u.data[0])
    const ids = rows.map((r) => r.id)
    if (ids.length) {
      const lr = await supabase.from('letter_recipients').select('letter_id, member_id').in('letter_id', ids)
      const map: Record<string, string[]> = {}
      for (const r of (lr.data ?? []) as { letter_id: string; member_id: string }[]) (map[r.letter_id] ??= []).push(r.member_id)
      setRecips(map)
    }
    setLoading(false)
  }, [family.id])

  useEffect(() => { void load() }, [load])

  // 有信还在分析中时,每 3 秒刷新一次
  const processing = letters.some((l) => l.status === 'pending' || l.status === 'processing')
  useEffect(() => {
    if (!processing) return
    const t = setInterval(() => void load(), 3000)
    return () => clearInterval(t)
  }, [processing, load])

  async function patch(id: string, p: Partial<Letter>) {
    setLetters((cur) => cur.map((l) => (l.id === id ? { ...l, ...p } : l)))  // 乐观更新
    const { error } = await supabase.from('letters').update(p).eq('id', id)
    if (error) { setErr(error.message); void load() }
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.display_name ?? '?'

  // 需要关注:开了提醒、未处理,且已逾期或 14 天内到期;或「与我相关」
  const alerts = useMemo(() => letters.filter((l) => {
    if (!l.alert_enabled || l.is_done || !l.due_date) return false
    const n = daysUntil(l.due_date)
    return n != null && n <= 14
  }).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1)), [letters])

  const shown = letters.filter((l) => {
    if (hideDone && l.is_done) return false
    if (cat && l.category !== cat) return false
    if (onlyImportant && !l.is_important) return false
    if (onlyMine && !(recips[l.id] ?? []).includes(me.id)) return false
    if (q) {
      const hay = `${l.title ?? ''} ${l.sender ?? ''} ${l.recipient_name ?? ''} ${l.summary ?? ''}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  return (
    <div className="stack">
      <div className="row between">
        <h2>信件</h2>
        <Link to="/upload" className="btn">＋ 添加信件</Link>
      </div>
      {usage && (
        <p className={`small ${usage.used >= usage.monthly_limit || usage.plan === 'suspended' ? 'error' : 'muted'}`}>
          {usage.plan === 'suspended'
            ? '此家庭的 AI 分析已暂停,请联系管理员。'
            : `本月 AI 分析:${usage.used} / ${usage.monthly_limit} 封${usage.used >= usage.monthly_limit ? '(已用完,下月 1 日恢复)' : ''}`}
        </p>
      )}

      {alerts.length > 0 && (
        <section className="card alertbox">
          <h3>⏰ 需要处理</h3>
          <ul>
            {alerts.map((l) => {
              const n = daysUntil(l.due_date)!
              return (
                <li key={l.id} className={n < 0 ? 'overdue' : n <= 3 ? 'soon' : ''}>
                  <Link to={`/letters/${l.id}`}>{l.title ?? '(未命名)'}</Link>
                  <span> · {dueLabel(l.due_date)}</span>
                  {l.amount_due != null && <span> · {formatMoney(l.amount_due, l.currency)}</span>}
                  <span className="muted"> · {(recips[l.id] ?? []).map(memberName).join('、') || '全家'}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="filters">
        <input type="search" placeholder="搜索标题 / 寄件人 / 收件人 / 简介" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | '')}>
          <option value="">全部分类</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={onlyImportant} onChange={(e) => setOnlyImportant(e.target.checked)} />只看重要</label>
        <label className="check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />只看我的</label>
        <label className="check"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />隐藏已处理</label>
      </div>

      {err && <p className="error">{err}</p>}
      {loading ? <p className="muted">加载中…</p> : shown.length === 0 ? (
        <div className="card center muted">{letters.length ? '没有符合条件的信件' : '还没有信件,点右上角「添加信件」开始。'}</div>
      ) : (
        <table className="letters">
          <thead>
            <tr><th></th><th>信件</th><th>收件人 / 地址</th><th>分类</th><th>到期</th><th>提醒</th></tr>
          </thead>
          <tbody>
            {shown.map((l) => {
              const warn = l.status === 'done' && l.recipient_is_family === false
              const n = daysUntil(l.due_date)
              return (
                <tr key={l.id} className={`${l.is_done ? 'done' : ''} ${warn ? 'warnrow' : ''}`}>
                  <td data-label="">
                    <button className={`star ${l.is_important ? 'on' : ''}`} aria-label="标记重要"
                      onClick={() => patch(l.id, { is_important: !l.is_important })}>
                      {l.is_important ? '★' : '☆'}
                    </button>
                  </td>
                  <td data-label="信件" className="main">
                    <Link to={`/letters/${l.id}`} className="title">
                      {warn && <span className="warn" title="收件人不是家庭成员">⚠️ </span>}
                      {l.status === 'done' ? (l.title ?? '(未命名)') : l.status === 'failed' ? '分析失败' : '分析中…'}
                    </Link>
                    <div className="muted small">{l.sender}</div>
                    <div className="small">{l.status === 'failed' ? <span className="error">{l.error}</span> : l.summary}</div>
                  </td>
                  <td data-label="收件人">
                    <div>{l.recipient_name ?? '—'}</div>
                    <div className="muted small">{l.recipient_address}</div>
                    {warn && <div className="warntext">{l.is_generic_addressee ? '泛称收件人(非本人)' : '不是家庭成员'}</div>}
                  </td>
                  <td data-label="分类"><span className={`chip cat-${l.category}`}>{CATEGORY_LABEL[l.category]}</span></td>
                  <td data-label="到期" className={n != null && n < 0 && !l.is_done ? 'overdue' : ''}>
                    {l.due_date ? <>{l.due_date}<div className="small">{dueLabel(l.due_date)}</div></> : '—'}
                    {l.amount_due != null && <div className="small">{formatMoney(l.amount_due, l.currency)}</div>}
                  </td>
                  <td data-label="提醒">
                    <label className="switch" title="开启后会提醒相关家人">
                      <input type="checkbox" checked={l.alert_enabled} onChange={(e) => patch(l.id, { alert_enabled: e.target.checked })} />
                      <span />
                    </label>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
