import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { LangSwitcher, TITLES, useI18n } from '../lib/i18n'

export default function SetupPage({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [familyName, setFamilyName] = useState('')
  const [title, setTitle] = useState('')
  const [fullName, setFullName] = useState('')
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
      family_name: familyName.trim(), my_name: fullName.trim(),
      invite_code: code.trim() || null, my_title: title || null,
    })
    setBusy(false)
    if (!error) return onDone()
    setErr(/INVALID_CODE/.test(error.message) ? t('setup.invalidCode')
      : /ALREADY_IN_FAMILY/.test(error.message) ? t('setup.alreadyInFamily') : error.message)
  }

  return (
    <div className="center card narrow">
      <div className="row between"><h2>{t('setup.title')}</h2><LangSwitcher /></div>
      <p className="muted small">{t('setup.signedInAs', { email })}</p>

      <form onSubmit={submit} className="stack">
        <label>{t('setup.code')}{isAdmin && <span className="muted small"> ({t('setup.codeAdminHint')})</span>}
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX"
            required={!isAdmin} autoCapitalize="characters" autoComplete="off" />
        </label>
        <label>{t('setup.familyName')}
          <input required value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder={t('setup.familyNamePh')} />
        </label>
        <div className="row name-row">
          <label className="title-col">{t('setup.title_')}
            <select value={title} onChange={(e) => setTitle(e.target.value)}>
              <option value="">—</option>
              {TITLES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="grow">{t('setup.fullName')}
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </label>
        </div>
        <p className="muted small">{t('setup.fullNameHelp')}</p>
        <button disabled={busy}>{busy ? t('setup.creating') : t('setup.create')}</button>
      </form>
      {err && <p className="error">{err}</p>}
      <p className="muted small">{t('setup.noCode')}</p>

      <div className="summary small">
        <b>{t('setup.invitedTitle')}</b> {t('setup.invitedBody')}
        <div><button className="link" onClick={onDone}>{t('setup.checkAgain')}</button></div>
      </div>
      <button className="link" onClick={() => supabase.auth.signOut()}>{t('nav.logout')}</button>
    </div>
  )
}
