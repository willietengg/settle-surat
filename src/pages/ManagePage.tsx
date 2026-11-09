import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PillNav } from '../components/PillNav'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import { TITLES, useI18n, type T } from '../lib/i18n'
import type { Address, AddressKind, Member, MemberStatus } from '../lib/types'
import { sameAddress } from '../lib/address'

export default function ManagePage({ tab }: { tab: 'family' | 'address' }) {
  const { t } = useI18n()
  return (
    <div className="stack">
      <h1 className="display">{t('manage.title')}</h1>
      <PillNav className="segmented" items={[
        { to: '/manage', end: true, label: t('tab.family') },
        { to: '/manage/address', label: t('tab.address') },
      ]} />
      <div key={tab} className="tab-panel">{tab === 'family' ? <FamilyTab /> : <AddressTab />}</div>
    </div>
  )
}

// ───────────────────────── Family ─────────────────────────

function StatusBadge({ status }: { status: MemberStatus }) {
  const { t } = useI18n()
  return <span className={`badge st-${status}`}><span className="dot" />{t(`status.${status}`)}</span>
}

function TitleSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">—</option>
      {TITLES.map((x) => <option key={x} value={x}>{x}</option>)}
      {value && !TITLES.includes(value) && <option value={value}>{value}</option>}
    </select>
  )
}

async function sendInvite(email: string) {
  return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
}

function dbError(t: T, msg: string): string {
  if (/duplicate|unique/i.test(msg)) return t('fam.duplicate')
  if (/VERIFIED_EMAIL_LOCKED/.test(msg)) return t('fam.emailLocked')
  if (/NAME_REQUIRED/.test(msg)) return t('fam.nameRequired')
  return msg
}

function FamilyTab() {
  const { me, members, family, isHost, refreshMembers } = useApp()
  const { t } = useI18n()
  const [title, setTitle] = useState(me.title ?? '')
  const [name, setName] = useState(me.display_name)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [nTitle, setNTitle] = useState('')
  const [nName, setNName] = useState('')
  const [nEmail, setNEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const flash = (m: string) => { setMsg(m); setErr('') }
  const fail = (m: string) => { setErr(m); setMsg('') }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('update_my_profile', { new_title: title || null, new_name: name.trim() })
    if (error) return fail(dbError(t, error.message))
    await refreshMembers(); flash(t('common.saved'))
  }

  async function addMember(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const email = nEmail.trim().toLowerCase()
    const { error } = await supabase.from('members').insert({
      family_id: family.id, title: nTitle || null, display_name: nName.trim(), email,
    })
    if (error) { setBusy(false); return fail(dbError(t, error.message)) }
    const r = await sendInvite(email)
    flash(r.error ? t('fam.mailFailed', { msg: r.error.message }) : t('fam.invited', { email }))
    setNTitle(''); setNName(''); setNEmail(''); setBusy(false)
    await refreshMembers()
  }

  const others = members.filter((m) => m.id !== me.id)

  return (
    <div className="stack">
      <form onSubmit={saveProfile} className="card stack">
        <div className="row between">
          <h3>{t('fam.you')}</h3>
          <span className="chip">{isHost ? t('fam.host') : t('fam.member')}</span>
        </div>
        <div className="row name-row">
          <label className="title-col">{t('setup.title_')}<TitleSelect value={title} onChange={setTitle} /></label>
          <label className="grow">{t('setup.fullName')}
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div className="row between wrap">
          <span className="muted small">{me.email}</span>
          <button>{t('common.save')}</button>
        </div>
      </form>

      <section className="card stack">
        <h3>{t('fam.members')}</h3>
        {!isHost && <p className="muted small">{t('fam.onlyHost')}</p>}
        {others.length === 0 && <p className="muted">{t('fam.noMembers')}</p>}
        <div className="member-head muted small">
          <span>{t('setup.title_')}</span><span>{t('setup.fullName')}</span><span>{t('fam.email')}</span><span>{t('fam.status')}</span>
        </div>
        {others.map((m) => (
          <MemberRow key={m.id} m={m} editable={isHost} onChanged={refreshMembers} flash={flash} fail={fail} />
        ))}
      </section>

      {isHost && (
        <form onSubmit={addMember} className="card stack">
          <h3>{t('fam.add')}</h3>
          <div className="row name-row">
            <label className="title-col">{t('setup.title_')}<TitleSelect value={nTitle} onChange={setNTitle} /></label>
            <label className="grow">{t('setup.fullName')}
              <input required value={nName} onChange={(e) => setNName(e.target.value)} />
            </label>
          </div>
          <label>{t('fam.email')}
            <input type="email" required value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="name@gmail.com" />
          </label>
          <p className="muted small">{t('fam.verifyHint')}</p>
          <button disabled={busy}>{busy ? t('fam.adding') : t('fam.addBtn')}</button>
        </form>
      )}
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  )
}

function MemberRow({ m, editable, onChanged, flash, fail }: {
  m: Member; editable: boolean; onChanged: () => Promise<void>
  flash: (s: string) => void; fail: (s: string) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(m.display_name)
  const [email, setEmail] = useState(m.email ?? '')
  const [aliases, setAliases] = useState(m.aliases.join(', '))
  useEffect(() => { setName(m.display_name); setEmail(m.email ?? ''); setAliases(m.aliases.join(', ')) }, [m])

  async function update(p: Partial<Member>) {
    const { error } = await supabase.from('members').update(p).eq('id', m.id)
    if (error) return fail(dbError(t, error.message))
    await onChanged()
  }

  async function updateEmail() {
    const v = email.trim().toLowerCase()
    if (!v || v === m.email) return
    const { error } = await supabase.from('members').update({ email: v }).eq('id', m.id)
    if (error) return fail(dbError(t, error.message))
    const r = await sendInvite(v)
    flash(r.error ? t('fam.mailFailed', { msg: r.error.message }) : t('fam.invited', { email: v }))
    await onChanged()
  }

  async function resend() {
    if (!m.email) return
    if (m.status === 'declined') {
      const { error } = await supabase.rpc('reinvite_member', { member: m.id })
      if (error) return fail(error.message)
    }
    const r = await sendInvite(m.email)
    flash(r.error ? t('fam.mailFailed', { msg: r.error.message }) : t('fam.resent', { email: m.email }))
    await onChanged()
  }

  async function remove() {
    if (!confirm(t('fam.removeConfirm', { name: m.display_name }))) return
    const { error } = await supabase.from('members').delete().eq('id', m.id)
    if (error) fail(error.message); else await onChanged()
  }

  const verified = m.status === 'verified'
  return (
    <div className={`member-row ${m.status === 'declined' ? 'declined' : ''}`}>
      <TitleSelect value={m.title ?? ''} disabled={!editable} onChange={(v) => update({ title: v || null })} />
      <input value={name} disabled={!editable} onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (name.trim() && name.trim() !== m.display_name) void update({ display_name: name.trim() }) }} />
      {verified || !editable
        ? <span className="email-ro">{m.email}</span>
        : <span className="row tight">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {email.trim().toLowerCase() !== m.email && <button className="link" onClick={updateEmail}>{t('fam.reenter')}</button>}
          </span>}
      <span className="row tight wrap">
        <StatusBadge status={m.status} />
        {m.role === 'admin' && <span className="chip">{t('fam.host')}</span>}
      </span>
      {editable && (
        <div className="member-actions row wrap">
          {!verified && <button className="link" onClick={resend}>{t('fam.resend')}</button>}
          <details className="grow">
            <summary className="small">{t('fam.aliases')}</summary>
            <input value={aliases} placeholder={t('fam.aliasesHelp')} onChange={(e) => setAliases(e.target.value)}
              onBlur={() => {
                const list = aliases.split(/[,,;;\n]/).map((s) => s.trim()).filter(Boolean)
                if (list.join('|') !== m.aliases.join('|')) void update({ aliases: list })
              }} />
          </details>
          {m.role !== 'admin' && <button className="link danger-text" onClick={remove}>{t('common.remove')}</button>}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Address ─────────────────────────

const KINDS: AddressKind[] = ['home', 'work', 'school', 'custom']

function AddressTab() {
  const { family } = useApp()
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const prefill = params.get('add') ?? ''
  const [list, setList] = useState<Address[]>([])
  const [letterAddrs, setLetterAddrs] = useState<string[]>([])
  const [kind, setKind] = useState<AddressKind>('home')
  const [label, setLabel] = useState('')
  const [text, setText] = useState(prefill)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [a, l] = await Promise.all([
      supabase.from('addresses').select('*').eq('family_id', family.id).order('created_at'),
      supabase.from('letters').select('recipient_address').eq('family_id', family.id).not('recipient_address', 'is', null),
    ])
    if (a.error) return setErr(a.error.message)
    setList(a.data as Address[])
    setLetterAddrs(((l.data ?? []) as { recipient_address: string }[]).map((r) => r.recipient_address))
  }, [family.id])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (prefill) setText(prefill) }, [prefill])

  async function add(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('addresses').insert({
      family_id: family.id, kind, custom_label: kind === 'custom' ? label.trim() || null : null, address: text.trim(),
    })
    if (error) return setErr(error.message)
    setText(''); setLabel(''); setKind('home'); setErr('')
    if (prefill) setParams({}, { replace: true })
    await load()
  }

  async function update(a: Address, p: Partial<Address>) {
    const { error } = await supabase.from('addresses').update(p).eq('id', a.id)
    if (error) setErr(error.message); else await load()
  }

  async function remove(a: Address) {
    if (!confirm(t('addr.deleteConfirm'))) return
    const { error } = await supabase.from('addresses').delete().eq('id', a.id)
    if (error) setErr(error.message); else await load()
  }

  return (
    <div className="stack">
      <p className="muted small">{t('addr.help')}</p>

      <form onSubmit={add} className={`card stack ${prefill ? 'highlight' : ''}`}>
        <h3>{t('addr.add')}</h3>
        {prefill && <p className="small">{t('addr.fromLetter')}</p>}
        <div className="row wrap">
          <label>{t('addr.kind')}
            <select value={kind} onChange={(e) => setKind(e.target.value as AddressKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
            </select>
          </label>
          {kind === 'custom' && (
            <label className="grow">{t('addr.customLabel')}
              <input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('addr.customPh')} />
            </label>
          )}
        </div>
        <label>{t('addr.address')}
          <textarea required rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('addr.placeholder')} />
        </label>
        <button>{t('addr.add')}</button>
      </form>

      <section className="card stack">
        <h3>{t('addr.title')}</h3>
        {list.length === 0 && <p className="muted">{t('addr.empty')}</p>}
        {list.map((a) => (
          <div key={a.id} className="addr-row">
            <div className="row wrap">
              <select value={a.kind} onChange={(e) => update(a, { kind: e.target.value as AddressKind })}>
                {KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
              </select>
              {a.kind === 'custom' && (
                <input defaultValue={a.custom_label ?? ''} placeholder={t('addr.customPh')}
                  onBlur={(e) => { if (e.target.value.trim() !== (a.custom_label ?? '')) void update(a, { custom_label: e.target.value.trim() || null }) }} />
              )}
              <span className="muted small">{t('addr.matched', { n: letterAddrs.filter((x) => sameAddress(x, a.address)).length })}</span>
              <button className="link danger-text" onClick={() => remove(a)}>{t('common.delete')}</button>
            </div>
            <textarea rows={2} defaultValue={a.address}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== a.address) void update(a, { address: v }) }} />
          </div>
        ))}
      </section>
      {err && <p className="error">{err}</p>}
    </div>
  )
}
