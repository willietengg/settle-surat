import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'

interface FamilyRow {
  id: string; name: string; plan: string; monthly_limit: number; members: number; letters: number
  used_this_month: number; owner_email: string | null; created_at: string
}
interface CodeRow { code: string; note: string | null; created_at: string; used_at: string | null; family_name: string | null }
interface AdminRow { email: string; created_at: string }

const PLANS = ['trial', 'free', 'paid', 'suspended'] as const

/** 平台管理员:发放开通码、查看各家庭用量、调整额度 / 停用、管理其他管理员。数据库端也会校验管理员身份。 */
export default function AdminPage() {
  const { t } = useI18n()
  const { session } = useApp()
  const myEmail = (session.user.email ?? '').toLowerCase()
  const [families, setFamilies] = useState<FamilyRow[]>([])
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [count, setCount] = useState(1)
  const [note, setNote] = useState('')
  const [fresh, setFresh] = useState<string[]>([])
  const [newAdmin, setNewAdmin] = useState('')
  const [err, setErr] = useState('')
  const [showUsed, setShowUsed] = useState(false)

  const load = useCallback(async () => {
    const [f, c, a] = await Promise.all([
      supabase.rpc('admin_list_families'), supabase.rpc('admin_list_codes'), supabase.rpc('admin_list_admins'),
    ])
    const e = f.error ?? c.error ?? a.error
    if (e) return setErr(e.message)
    setFamilies(f.data as FamilyRow[]); setCodes(c.data as CodeRow[]); setAdmins(a.data as AdminRow[])
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

  async function addAdmin(e: FormEvent) {
    e.preventDefault(); setErr('')
    const { error } = await supabase.rpc('admin_add_admin', { new_email: newAdmin.trim() })
    if (error) return setErr(/INVALID_EMAIL/.test(error.message) ? t('admin.invalidEmail') : error.message)
    setNewAdmin(''); void load()
  }

  async function removeAdmin(email: string) {
    if (!confirm(t('admin.removeAdminConfirm', { email }))) return
    const { error } = await supabase.rpc('admin_remove_admin', { old_email: email })
    if (error) return setErr(/CANNOT_REMOVE_SELF/.test(error.message) ? t('admin.cannotRemoveSelf') : error.message)
    void load()
  }

  function share(c: string) {
    const text = t('admin.shareText', { code: c, url: window.location.origin })
    if (navigator.share) void navigator.share({ text }).catch(() => {})
    else void navigator.clipboard.writeText(text)
  }

  const unused = codes.filter((c) => !c.used_at)
  const totalUsed = families.reduce((s, f) => s + f.used_this_month, 0)

  return (
    <div className="stack">
      <h1 className="display">{t('admin.title')}</h1>
      {err && <p className="error">{err}</p>}

      <section className="card stack">
        <h3>{t('admin.codes')}</h3>
        <p className="muted small">{t('admin.codesHelp')}</p>
        <form onSubmit={generate} className="row wrap">
          <label style={{ width: 100 }}>{t('admin.count')}
            <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <label className="grow">{t('admin.note')}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('admin.notePh')} />
          </label>
          <button style={{ alignSelf: 'flex-end' }}>{t('admin.generate')}</button>
        </form>
        {fresh.length > 0 && (
          <div className="summary">
            {t('admin.newCodes')}:{fresh.map((c) => (
              <div key={c} className="row between"><code className="bigcode">{c}</code><button className="link" onClick={() => share(c)}>{t('admin.share')}</button></div>
            ))}
          </div>
        )}
        <details open={unused.length > 0 && unused.length <= 10}>
          <summary>{t('admin.unused', { n: unused.length })}</summary>
          {unused.map((c) => (
            <div key={c.code} className="row between small">
              <span><code>{c.code}</code> <span className="muted">{c.note}</span></span>
              <button className="link" onClick={() => share(c.code)}>{t('admin.share')}</button>
            </div>
          ))}
        </details>
        <label className="check small">
          <input type="checkbox" checked={showUsed} onChange={(e) => setShowUsed(e.target.checked)} />{t('admin.showUsed')}
        </label>
        {showUsed && codes.filter((c) => c.used_at).map((c) => (
          <div key={c.code} className="small muted"><code>{c.code}</code> → {c.family_name ?? t('admin.familyDeleted')} · {c.used_at?.slice(0, 10)}</div>
        ))}
      </section>

      <section className="card stack">
        <div className="row between wrap">
          <h3>{t('admin.families', { n: families.length })}</h3>
          <span className="muted small">{t('admin.analysedThisMonth', { n: totalUsed })}</span>
        </div>
        <table className="letters admin">
          <thead><tr>
            <th>{t('admin.colFamily')}</th><th>{t('admin.colMembers')}</th><th>{t('admin.colUsage')}</th>
            <th>{t('admin.colPlan')}</th><th>{t('admin.colLimit')}</th>
          </tr></thead>
          <tbody>
            {families.map((f) => (
              <tr key={f.id} className={f.plan === 'suspended' ? 'done' : ''}>
                <td data-label={t('admin.colFamily')}><b>{f.name}</b><div className="muted small">{f.owner_email}</div></td>
                <td data-label={t('admin.colMembers')}>{t('admin.membersLetters', { m: f.members, l: f.letters })}</td>
                <td data-label={t('admin.colUsage')} className={f.used_this_month >= f.monthly_limit ? 'overdue' : ''}>
                  {f.used_this_month} / {f.monthly_limit}
                </td>
                <td data-label={t('admin.colPlan')}>
                  <select value={f.plan} onChange={(e) => update(f, e.target.value, f.monthly_limit)}>
                    {PLANS.map((p) => <option key={p} value={p}>{t(`plan.${p}`)}</option>)}
                  </select>
                </td>
                <td data-label={t('admin.colLimit')}>
                  <input type="number" min={0} defaultValue={f.monthly_limit} style={{ width: 90 }}
                    onBlur={(e) => { const n = Number(e.target.value); if (n >= 0 && n !== f.monthly_limit) void update(f, f.plan, n) }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <h3>{t('admin.admins')}</h3>
        <p className="muted small">{t('admin.adminsHelp')}</p>
        {admins.map((a) => (
          <div key={a.email} className="row between">
            <span>{a.email} {a.email === myEmail && <span className="muted small">{t('admin.you')}</span>}</span>
            {a.email !== myEmail && <button className="link danger-text" onClick={() => removeAdmin(a.email)}>{t('common.remove')}</button>}
          </div>
        ))}
        <form onSubmit={addAdmin} className="row wrap">
          <label className="grow">{t('admin.adminEmail')}
            <input type="email" required value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} placeholder="name@gmail.com" />
          </label>
          <button style={{ alignSelf: 'flex-end' }}>{t('admin.addAdmin')}</button>
        </form>
      </section>
    </div>
  )
}
