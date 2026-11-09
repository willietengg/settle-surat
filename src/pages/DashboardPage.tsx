import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import { letterErrorText, useI18n } from '../lib/i18n'
import type { Address, Category, Letter } from '../lib/types'
import {
  addressLabel, CATEGORIES, catLabel, daysUntil, dueLabel, formatMoney, letterSummary, letterTitle,
} from '../lib/labels'
import { findAddress } from '../lib/address'
import { Switch } from '../components/Switch'
import { SkeletonList } from '../components/Skeleton'
import { IconPin, IconPlus } from '../components/Icons'

/** 地址标签:已登记 → Home/Work…;未登记 → "New address" + 添加按钮 */
export function AddressTag({ address, saved }: { address: string | null; saved: Address[] }) {
  const { t } = useI18n()
  if (!address) return null
  const hit = findAddress(address, saved)
  if (hit) return <span className={`chip addr-${hit.kind}`}><IconPin /> {addressLabel(t, hit)}</span>
  return (
    <span className="row tight">
      <span className="chip addr-new"><IconPin /> {t('addr.new')}</span>
      <Link className="small" to={`/manage/address?add=${encodeURIComponent(address)}`}>{t('addr.addThis')}</Link>
    </span>
  )
}

export default function DashboardPage() {
  const { family, me, members } = useApp()
  const { t, lang } = useI18n()
  const [letters, setLetters] = useState<Letter[]>([])
  const [addresses, setAddresses] = useState<Address[]>([])
  const [recips, setRecips] = useState<Record<string, string[]>>({})
  const [usage, setUsage] = useState<{ used: number; monthly_limit: number; plan: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [cat, setCat] = useState<Category | ''>('')
  const [addrFilter, setAddrFilter] = useState('')
  const [onlyImportant, setOnlyImportant] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)
  const [hideDone, setHideDone] = useState(true)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const [l, a, u] = await Promise.all([
      supabase.from('letters').select('*').eq('family_id', family.id).order('created_at', { ascending: false }),
      supabase.from('addresses').select('*').eq('family_id', family.id).order('created_at'),
      supabase.rpc('get_family_usage', { fid: family.id }),
    ])
    if (l.error) { setErr(l.error.message); setLoading(false); return }
    const rows = l.data as Letter[]
    setLetters(rows)
    if (!a.error) setAddresses(a.data as Address[])
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
    const timer = setInterval(() => void load(), 3000)
    return () => clearInterval(timer)
  }, [processing, load])

  async function patch(id: string, p: Partial<Letter>) {
    setLetters((cur) => cur.map((l) => (l.id === id ? { ...l, ...p } : l))) // 乐观更新
    const { error } = await supabase.from('letters').update(p).eq('id', id)
    if (error) { setErr(error.message); void load() }
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.display_name ?? '?'

  // 需要关注:开了提醒、未处理,且已逾期或 14 天内到期
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
    if (addrFilter) {
      const hit = findAddress(l.recipient_address, addresses)
      if (addrFilter === '__new' ? (hit || !l.recipient_address) : hit?.id !== addrFilter) return false
    }
    if (q) {
      const hay = `${letterTitle(t, lang, l)} ${l.sender ?? ''} ${l.recipient_name ?? ''} ${letterSummary(lang, l)}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  const full = usage && (usage.used >= usage.monthly_limit || usage.plan === 'suspended')
  const hour = new Date().getHours()
  const greetKey = hour < 12 ? 'greet.morning' : hour < 18 ? 'greet.afternoon' : 'greet.evening'
  const firstName = me.display_name.split(/\s+/)[0]

  return (
    <div className="stack gap-lg">
      <header className="page-head">
        <div className="stack gap-xs">
          <h1 className="display">{t(greetKey, { name: firstName })}</h1>
          {usage && (usage.plan === 'suspended'
            ? <p className="small error">{t('dash.suspended')}</p>
            : (
              <div className="usage" title={t('dash.usage', { used: usage.used, limit: usage.monthly_limit })}>
                <div className="usage-bar"><span style={{ transform: `scaleX(${Math.min(1, usage.used / Math.max(1, usage.monthly_limit))})` }} data-full={!!full} /></div>
                <span className={`small ${full ? 'error' : 'muted'}`}>
                  {t('dash.usageShort', { used: usage.used, limit: usage.monthly_limit })}{full && ` — ${t('dash.usageFull')}`}
                </span>
              </div>
            ))}
        </div>
        <Link to="/upload" className="btn btn-cta"><IconPlus />{t('dash.add')}</Link>
      </header>

      {alerts.length > 0 && (
        <section className="card alertbox">
          <h3>{t('dash.attention')}</h3>
          <ul className="attention">
            {alerts.map((l, i) => {
              const n = daysUntil(l.due_date)!
              return (
                <li key={l.id} className={`appear ${n < 0 ? 'overdue' : n <= 3 ? 'soon' : ''}`} style={{ ['--i' as string]: i }}>
                  <Link to={`/letters/${l.id}`} className="attention-row">
                    <span className="dot-status" />
                    <span className="grow">
                      <b>{letterTitle(t, lang, l)}</b>
                      <span className="muted small"> · {(recips[l.id] ?? []).map(memberName).join(', ') || t('dash.everyone')}</span>
                    </span>
                    <span className="attention-due">
                      {dueLabel(t, l.due_date)}
                      {l.amount_due != null && <span className="muted"> · {formatMoney(lang, l.amount_due, l.currency)}</span>}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="filters">
        <input type="search" placeholder={t('dash.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | '')}>
          <option value="">{t('dash.allCategories')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(t, c)}</option>)}
        </select>
        <select value={addrFilter} onChange={(e) => setAddrFilter(e.target.value)}>
          <option value="">{t('dash.allAddresses')}</option>
          {addresses.map((a) => <option key={a.id} value={a.id}>{addressLabel(t, a)}</option>)}
          <option value="__new">{t('dash.unsavedAddresses')}</option>
        </select>
        <label className="check"><input type="checkbox" checked={onlyImportant} onChange={(e) => setOnlyImportant(e.target.checked)} />{t('dash.onlyImportant')}</label>
        <label className="check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />{t('dash.onlyMine')}</label>
        <label className="check"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />{t('dash.hideDone')}</label>
      </div>

      {err && <p className="error">{err}</p>}
      {loading ? <SkeletonList /> : shown.length === 0 ? (
        <div className="card empty muted">{letters.length ? t('dash.noMatch') : t('dash.empty')}</div>
      ) : (
        <table className="letters">
          <thead>
            <tr><th></th><th>{t('col.letter')}</th><th>{t('col.recipient')}</th><th>{t('col.category')}</th><th>{t('col.due')}</th><th>{t('col.alert')}</th></tr>
          </thead>
          <tbody>
            {shown.map((l, i) => {
              const warn = l.status === 'done' && l.recipient_is_family === false
              const n = daysUntil(l.due_date)
              return (
                <tr key={l.id} className={`appear ${l.is_done ? 'done' : ''} ${warn ? 'warnrow' : ''}`} style={{ ['--i' as string]: Math.min(i, 10) }}>
                  <td data-label="">
                    <button className={`star ${l.is_important ? 'on' : ''}`} aria-label={t('letter.markImportant')} aria-pressed={l.is_important}
                      onClick={() => patch(l.id, { is_important: !l.is_important })}>
                      <span key={String(l.is_important)} className="star-glyph">{l.is_important ? '★' : '☆'}</span>
                    </button>
                  </td>
                  <td data-label={t('col.letter')} className="main">
                    <Link to={`/letters/${l.id}`} className="title">
                      {(warn || l.is_suspicious) && <span className="warn" title={t('warn.notFamily')}>⚠️ </span>}
                      {l.status === 'done' ? letterTitle(t, lang, l)
                        : l.status === 'failed' ? t('letter.failed') : <span className="shimmer-text">{t('letter.analyzing')}</span>}
                    </Link>
                    <div className="muted small">{l.sender}</div>
                    <div className="small">
                      {l.status === 'failed' ? <span className="error">{letterErrorText(t, l.error)}</span> : letterSummary(lang, l)}
                    </div>
                  </td>
                  <td data-label={t('col.recipient')}>
                    <div>{l.recipient_name ?? '—'}</div>
                    <div className="muted small">{l.recipient_address}</div>
                    <AddressTag address={l.recipient_address} saved={addresses} />
                    {warn && <div className="warntext">{l.is_generic_addressee ? t('warn.generic') : t('warn.notFamily')}</div>}
                  </td>
                  <td data-label={t('col.category')}><span className={`chip cat-${l.category}`}>{catLabel(t, l.category)}</span></td>
                  <td data-label={t('col.due')} className={n != null && n < 0 && !l.is_done ? 'overdue' : ''}>
                    {l.due_date ? <><span className="nowrap">{l.due_date}</span><div className="small">{dueLabel(t, l.due_date)}</div></> : '—'}
                    {l.amount_due != null && <div className="small">{formatMoney(lang, l.amount_due, l.currency)}</div>}
                  </td>
                  <td data-label={t('col.alert')}>
                    <Switch checked={l.alert_enabled} label={t('letter.alertHint')} onChange={(v) => patch(l.id, { alert_enabled: v })} />
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
