import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import { docxTextFromStorage, errorMessage, signedUrl } from '../lib/files'
import { letterErrorText, useI18n } from '../lib/i18n'
import type { Address, Category, Letter } from '../lib/types'
import { CATEGORIES, catLabel, dueLabel, formatMoney, letterSummary, letterTitle } from '../lib/labels'
import { AddressTag } from './DashboardPage'

export default function LetterDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { t, lang } = useI18n()
  const { members, isHost, refreshMembers, family } = useApp()
  const [letter, setLetter] = useState<Letter | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [recipIds, setRecipIds] = useState<string[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [showText, setShowText] = useState(true)
  const [fixing, setFixing] = useState(false)
  const [fixIds, setFixIds] = useState<string[]>([])
  const [titleDraft, setTitleDraft] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('letters').select('*').eq('id', id!).single()
    if (error || !data) { setNotFound(true); return }
    const l = data as Letter
    setLetter(l)
    const [lr, a] = await Promise.all([
      supabase.from('letter_recipients').select('member_id').eq('letter_id', l.id),
      supabase.from('addresses').select('*').eq('family_id', family.id),
    ])
    setRecipIds((lr.data ?? []).map((r: { member_id: string }) => r.member_id))
    if (!a.error) setAddresses(a.data as Address[])
    const entries = await Promise.all(l.files.map(async (f) => [f.path, await signedUrl(f.path)] as const))
    setUrls(Object.fromEntries(entries.filter(([, u]) => u) as [string, string][]))
  }, [id, family.id])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (letter) setTitleDraft(letter.title_i18n?.[lang] || letter.title || '') }, [letter?.id, letter?.status, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  // 分析中:轮询
  useEffect(() => {
    if (!letter || (letter.status !== 'pending' && letter.status !== 'processing')) return
    const timer = setInterval(() => void load(), 3000)
    return () => clearInterval(timer)
  }, [letter, load])

  async function patch(p: Partial<Letter>) {
    if (!letter) return
    setLetter({ ...letter, ...p })
    const { error } = await supabase.from('letters').update(p).eq('id', letter.id)
    if (error) { setErr(error.message); void load() }
  }

  async function saveTitle() {
    if (!letter) return
    const v = titleDraft.trim()
    if (v === (letter.title_i18n?.[lang] || letter.title || '')) return
    await patch({ title_i18n: { ...letter.title_i18n, [lang]: v }, ...(lang === 'en' || !letter.title ? { title: v || null } : {}) })
  }

  async function retry() {
    if (!letter) return
    setErr('')
    try {
      const extra = await docxTextFromStorage(letter.files)
      setLetter({ ...letter, status: 'processing', error: null })
      await supabase.functions.invoke('analyze-letter', { body: { letter_id: letter.id, extra_text: extra } })
      await load()
    } catch (e) {
      setErr(errorMessage(t, e))
    }
  }

  async function remove() {
    if (!letter || !confirm(t('detail.deleteConfirm'))) return
    const paths = letter.files.map((f) => f.path)
    if (paths.length) await supabase.storage.from('letters').remove(paths)
    const { error } = await supabase.from('letters').delete().eq('id', letter.id)
    if (error) setErr(error.message); else nav('/')
  }

  /** 用户更正:「这封信其实是给某位家人的」→ 清除警告,并(host 时)把这种写法记为别名 */
  async function confirmRecipients() {
    if (!letter || !fixIds.length) return
    setErr('')
    await supabase.from('letter_recipients').delete().eq('letter_id', letter.id)
    const ins = await supabase.from('letter_recipients').insert(fixIds.map((member_id) => ({ letter_id: letter.id, member_id })))
    if (ins.error) { setErr(ins.error.message); return }
    await patch({ recipient_is_family: true })
    if (isHost && letter.recipient_name && fixIds.length === 1) {
      const m = members.find((x) => x.id === fixIds[0])
      const names = letter.recipient_name.split(' / ').map((s) => s.trim()).filter(Boolean)
      if (m && names.length === 1 && !m.aliases.includes(names[0])) {
        await supabase.from('members').update({ aliases: [...m.aliases, names[0]] }).eq('id', m.id)
        await refreshMembers()
      }
    }
    setFixing(false)
    setRecipIds(fixIds)
  }

  if (notFound) return <div className="card"><p className="error">{t('detail.notFound')}</p><Link to="/">{t('detail.back')}</Link></div>
  if (!letter) return <p className="muted">{t('common.loading')}</p>

  const analyzing = letter.status === 'pending' || letter.status === 'processing'
  const warn = letter.status === 'done' && letter.recipient_is_family === false
  const names = (ids: string[]) => ids.map((i) => members.find((m) => m.id === i)?.display_name).filter(Boolean).join(', ')

  return (
    <div className="stack">
      <Link to="/">{t('detail.back')}</Link>

      {letter.is_suspicious && <div className="card warnbox"><b>{t('detail.suspicious')}</b></div>}

      {warn && (
        <div className="card warnbox">
          <h3>{t('detail.notFamilyTitle')}</h3>
          <p>
            {t('detail.notFamilyBody', { name: letter.recipient_name || t('detail.noName') })}
            {letter.is_generic_addressee && ` ${t('detail.generic')}`}
          </p>
          {!fixing ? (
            <button className="secondary" onClick={() => { setFixing(true); setFixIds([]) }}>{t('detail.itsForFamily')}</button>
          ) : (
            <div className="stack">
              <div>{t('detail.chooseMembers')}</div>
              {members.filter((m) => m.status !== 'declined').map((m) => (
                <label key={m.id} className="check">
                  <input type="checkbox" checked={fixIds.includes(m.id)}
                    onChange={(e) => setFixIds((c) => e.target.checked ? [...c, m.id] : c.filter((x) => x !== m.id))} />
                  {[m.title, m.display_name].filter(Boolean).join(' ')}
                </label>
              ))}
              {isHost && <p className="muted small">{t('detail.aliasNote')}</p>}
              <div className="row">
                <button disabled={!fixIds.length} onClick={confirmRecipients}>{t('common.confirm')}</button>
                <button className="secondary" onClick={() => setFixing(false)}>{t('common.cancel')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {analyzing && <div className="card">{t('detail.analyzing')}</div>}
      {letter.status === 'failed' && (
        <div className="card warnbox">
          <p className="error">{t('detail.failed', { msg: letterErrorText(t, letter.error) })}</p>
          <button onClick={retry}>{t('detail.retry')}</button>
        </div>
      )}
      {err && <p className="error">{err}</p>}

      <section className="card stack">
        <div className="row between">
          <input className="titleinput" value={titleDraft} placeholder={t('detail.titlePh')}
            onChange={(e) => setTitleDraft(e.target.value)} onBlur={saveTitle} />
          <button className={`star big ${letter.is_important ? 'on' : ''}`} aria-label={t('letter.markImportant')}
            onClick={() => patch({ is_important: !letter.is_important })}>
            {letter.is_important ? '★' : '☆'}
          </button>
        </div>
        {letter.status === 'done' && !titleDraft && <span className="muted small">{letterTitle(t, lang, letter)}</span>}

        {letterSummary(lang, letter) && <p className="summary">{letterSummary(lang, letter)}</p>}

        <dl className="facts">
          <dt>{t('detail.sender')}</dt><dd>{letter.sender ?? '—'}</dd>
          <dt>{t('detail.recipient')}</dt><dd>{letter.recipient_name ?? '—'}</dd>
          <dt>{t('detail.address')}</dt>
          <dd>{letter.recipient_address ?? '—'} <AddressTag address={letter.recipient_address} saved={addresses} /></dd>
          <dt>{t('detail.related')}</dt><dd>{names(recipIds) || '—'}</dd>
          <dt>{t('detail.category')}</dt>
          <dd>
            <select value={letter.category} onChange={(e) => patch({ category: e.target.value as Category })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(t, c)}</option>)}
            </select>
          </dd>
          <dt>{t('detail.due')}</dt>
          <dd>
            <input type="date" value={letter.due_date ?? ''} onChange={(e) => patch({ due_date: e.target.value || null })} />
            {letter.due_date && <span className="muted"> {dueLabel(t, letter.due_date)}</span>}
          </dd>
          {letter.amount_due != null && (<><dt>{t('detail.amount')}</dt><dd>{formatMoney(lang, letter.amount_due, letter.currency)}</dd></>)}
        </dl>

        <div className="row wrap">
          <label className="check">
            <span className="switch"><input type="checkbox" checked={letter.alert_enabled} onChange={(e) => patch({ alert_enabled: e.target.checked })} /><span /></span>
            {t('detail.alert')}
          </label>
          <label className="check">
            <input type="checkbox" checked={letter.is_done} onChange={(e) => patch({ is_done: e.target.checked })} />
            {t('detail.done')}
          </label>
        </div>
      </section>

      {letter.full_text && (
        <section className="card stack">
          <div className="row between">
            <h3>{t('detail.fullText')}</h3>
            <button className="link" onClick={() => setShowText(!showText)}>{showText ? t('detail.collapse') : t('detail.expand')}</button>
          </div>
          {showText && <pre className="fulltext">{letter.full_text}</pre>}
          <p className="muted small">{t('detail.aiNote')}</p>
        </section>
      )}

      {letter.files.length > 0 && (
        <section className="card stack">
          <h3>{t('detail.original')}</h3>
          {letter.files.map((f) => {
            const u = urls[f.path]
            if (!u) return <div key={f.path} className="muted">{t('detail.noPreview', { name: f.name ?? '' })}</div>
            if (f.mime.startsWith('image/')) return <a key={f.path} href={u} target="_blank" rel="noreferrer"><img className="orig" src={u} alt={f.name} /></a>
            return <a key={f.path} className="btn secondary" href={u} target="_blank" rel="noreferrer">{t('detail.open', { name: f.name ?? '' })}</a>
          })}
        </section>
      )}

      <div className="row">
        {letter.status === 'done' && <button className="secondary" onClick={retry}>{t('detail.retry')}</button>}
        <button className="danger" onClick={remove}>{t('common.delete')}</button>
      </div>
    </div>
  )
}
