import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Family, Member } from './lib/types'

interface AppState {
  session: Session
  family: Family
  me: Member
  members: Member[]
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

type Loaded =
  | { state: 'loading' }
  | { state: 'no-family' }
  | { state: 'error'; message: string }
  | { state: 'ok'; family: Family; me: Member; members: Member[] }

/** 登录后:先认领邀请 → 找到自己所属家庭 → 加载成员。没有家庭则引导创建。 */
export function AppProvider({ session, children, fallback }: {
  session: Session
  children: ReactNode
  fallback: (s: { state: 'loading' | 'no-family' | 'error'; message?: string; reload: () => void }) => ReactNode
}) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })

  const load = useCallback(async () => {
    setLoaded({ state: 'loading' })
    const claim = await supabase.rpc('claim_membership')
    if (claim.error) return setLoaded({ state: 'error', message: claim.error.message })

    const mine = await supabase.from('members').select('*').eq('user_id', session.user.id).order('created_at').limit(1)
    if (mine.error) return setLoaded({ state: 'error', message: mine.error.message })
    if (!mine.data?.length) return setLoaded({ state: 'no-family' })
    const me = mine.data[0] as Member

    const [fam, mem] = await Promise.all([
      supabase.from('families').select('id, name').eq('id', me.family_id).single(),
      supabase.from('members').select('*').eq('family_id', me.family_id).order('created_at'),
    ])
    if (fam.error || mem.error) return setLoaded({ state: 'error', message: (fam.error ?? mem.error)!.message })
    setLoaded({ state: 'ok', family: fam.data as Family, me, members: mem.data as Member[] })
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

  if (loaded.state !== 'ok') {
    return <>{fallback({ state: loaded.state, message: loaded.state === 'error' ? loaded.message : undefined, reload: load })}</>
  }
  return (
    <Ctx.Provider value={{ session, family: loaded.family, me: loaded.me, members: loaded.members, refreshMembers }}>
      {children}
    </Ctx.Provider>
  )
}
