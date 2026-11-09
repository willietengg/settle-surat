import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { LangSwitcher, useI18n } from '../lib/i18n'
import type { Invitation } from '../lib/types'

/** 被邀请的人登录后看到的页面:接受 → 加入家庭(状态变绿);拒绝 → host 那边显示红色 */
export default function InvitationPage({ invitations, onDone }: { invitations: Invitation[]; onDone: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  async function respond(inv: Invitation, accept: boolean) {
    if (!accept && !confirm(t('invite.declineConfirm'))) return
    setBusy(inv.member_id); setErr('')
    const { error } = await supabase.rpc('respond_invitation', { invitation: inv.member_id, accept })
    setBusy('')
    if (error) setErr(/ALREADY_IN_FAMILY/.test(error.message) ? t('setup.alreadyInFamily') : error.message)
    else onDone()
  }

  return (
    <div className="center card narrow">
      <div className="row between"><h2>✉️ {t('invite.title')}</h2><LangSwitcher /></div>
      {invitations.map((inv) => (
        <div key={inv.member_id} className="summary stack">
          <p>{t('invite.body', {
            host: inv.host_name ?? '—',
            family: inv.family_name,
            name: [inv.title, inv.display_name].filter(Boolean).join(' '),
          })}</p>
          <div className="row">
            <button disabled={!!busy} onClick={() => respond(inv, true)}>{t('invite.accept')}</button>
            <button disabled={!!busy} className="secondary" onClick={() => respond(inv, false)}>{t('invite.decline')}</button>
          </div>
        </div>
      ))}
      {err && <p className="error">{err}</p>}
      <button className="link" onClick={() => supabase.auth.signOut()}>{t('nav.logout')}</button>
    </div>
  )
}
