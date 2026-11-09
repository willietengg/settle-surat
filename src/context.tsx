import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Family, Invitation, Member } from './lib/types'

interface AppState {
  session: Session
  family: Family
  me: Member
  members: Member[]
  isHost: boolean
  isPlatformAdmin: boolean
  refreshMembers: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)
export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return { session, ready }
}

export type Gate =
  | { state: 'loading' }
  | { state: 'no-family' }
  | { state: 'invited'; invitations: Invitation[] }
  | { state: 'error'; message: string }

type Loaded = Gate | { state: 'ok'; family: Family; me: Member; members: Member[]; isPlatformAdmin: boolean }

/** 登录后:有家庭 → 进入;没有家庭但有邀请 → 显示邀请;都没有 → 创建家庭。 */
export function AppProvider({ session, children, fallback }: {
  session: Session
  children: ReactNode
  fallback: (g: Gate, reload: () => void) => ReactNode
}) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })

  const load = useCallback(async () => {
    setLoaded({ state: 'loading' })
    const mine = await supabase.from('members').select('*').eq('user_id', session.user.id).order('created_at').limit(1)
    if (mine.error) return setLoaded({ state: 'error', message: mine.error.message })

    if (!mine.data?.length) {
      const inv = await supabase.rpc('my_invitations')
      if (inv.error) return setLoaded({ state: 'error', message: inv.error.message })
      const invitations = (inv.data ?? []) as Invitation[]
      return setLoaded(invitations.length ? { state: 'invited', invitations } : { state: 'no-family' })
    }
    const me = mine.data[0] as Member

    const [fam, mem, adm] = await Promise.all([
      supabase.from('families').select('id, name').eq('id', me.family_id).single(),
      supabase.from('members').select('*').eq('family_id', me.family_id).order('created_at'),
      supabase.rpc('is_platform_admin'),
    ])
    if (fam.error || mem.error) return setLoaded({ state: 'error', message: (fam.error ?? mem.error)!.message })
    setLoaded({
      state: 'ok', family: fam.data as Family, me, members: mem.data as Member[], isPlatformAdmin: adm.data === true,
    })
  }, [session.user.id])

  useEffect(() => { void load() }, [load])

  const refreshMembers = useCallback(async () => {
    if (loaded.state !== 'ok') return
    const mem = await supabase.from('members').select('*').eq('family_id', loaded.family.id).order('created_at')
    if (!mem.error) {
      const members = mem.data as Member[]
      setLoaded({ ...loaded, members, me: members.find((m) => m.id === loaded.me.id) ?? loaded.me })
    }
  }, [loaded])

  if (loaded.state !== 'ok') return <>{fallback(loaded, () => void load())}</>
  return (
    <Ctx.Provider value={{
      session, family: loaded.family, me: loaded.me, members: loaded.members,
      isHost: loaded.me.role === 'admin', isPlatformAdmin: loaded.isPlatformAdmin, refreshMembers,
    }}>
      {children}
    </Ctx.Provider>
  )
}
