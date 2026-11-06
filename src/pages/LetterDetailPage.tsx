import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import { docxTextFromStorage, signedUrl } from '../lib/files'
import type { Category, Letter } from '../lib/types'
import { CATEGORIES, CATEGORY_LABEL, dueLabel, formatMoney } from '../lib/labels'

export default function LetterDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { members, me, refreshMembers } = useApp()
  const [letter, setLetter] = useState<Letter | null>(null)
  const [recipIds, setRecipIds] = useState<string[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [showText, setShowText] = useState(true)
  const [fixing, setFixing] = useState(false)
  const [fixIds, setFixIds] = useState<string[]>([])

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('letters').select('*').eq('id', id!).single()
    if (error || !data) { setErr(error?.message ?? '找不到这封信'); return }
    const l = data as Letter
    setLetter(l)
    const lr = await supabase.from('letter_recipients').select('member_id').eq('letter_id', l.id)
    setRecipIds((lr.data ?? []).map((r: { member_id: string }) => r.member_id))
    const entries = await Promise.all(l.files.map(async (f) => [f.path, await signedUrl(f.path)] as const))
    setUrls(Object.fromEntries(entries.filter(([, u]) => u) as [string, string][]))
  }, [id])

  useEffect(() => { void load() }, [load])

  // 分析中:轮询
  useEffect(() => {
    if (!letter || (letter.status !== 'pending' && letter.status !== 'processing')) return
    const t = setInterval(() => void load(), 3000)
    return () => clearInterval(t)
  }, [letter, load])

  async function patch(p: Partial<Letter>) {
    if (!letter) return
    setLetter({ ...letter, ...p })
    const { error } = await supabase.from('letters').update(p).eq('id', letter.id)
    if (error) { setErr(error.message); void load() }
  }

  async function retry() {
    if (!letter) return
    setErr('')
    try {
      const extra = await docxTextFromStorage(letter.files)
      setLetter({ ...letter, status: 'processing', error: null })
      const { error } = await supabase.functions.invoke('analyze-letter', { body: { letter_id: letter.id, extra_text: extra } })
      if (error) throw new Error(error.message)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove() {
    if (!letter || !confirm('确定删除这封信和它的文件吗?此操作不可恢复。')) return
    const paths = letter.files.map((f) => f.path)
    if (paths.length) await supabase.storage.from('letters').remove(paths)
    const { error } = await supabase.from('letters').delete().eq('id', letter.id)
    if (error) setErr(error.message); else nav('/')
  }

  /** 用户更正:「这封信其实是给某位家人的」→ 清除警告,并(管理员时)把这种写法记为别名,以后自动识别。 */
  async function confirmRecipients() {
    if (!letter || !fixIds.length) return
    setErr('')
    await supabase.from('letter_recipients').delete().eq('letter_id', letter.id)
    const ins = await supabase.from('letter_recipients').insert(fixIds.map((member_id) => ({ letter_id: letter.id, member_id })))
    if (ins.error) { setErr(ins.error.message); return }
    await patch({ recipient_is_family: true })
    if (me.role === 'admin' && letter.recipient_name && fixIds.length === 1) {
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

  if (err && !letter) return <div className="card"><p className="error">{err}</p><Link to="/">返回</Link></div>
  if (!letter) return <p className="muted">加载中…</p>

  const analyzing = letter.status === 'pending' || letter.status === 'processing'
  const warn = letter.status === 'done' && letter.recipient_is_family === false
  const names = (ids: string[]) => ids.map((i) => members.find((m) => m.id === i)?.display_name).filter(Boolean).join('、')

  return (
    <div className="stack">
      <Link to="/">← 返回列表</Link>

      {warn && (
        <div className="card warnbox">
          <h3>⚠️ 这封信的收件人不是家庭成员</h3>
          <p>
            信上写的收件人:<b>{letter.recipient_name || '(没有姓名)'}</b>
            {letter.is_generic_addressee && '(泛称,如 Current Resident)'}。
            可能是前住户的信、错投、广告,也可能是诈骗,请谨慎处理,不要随意点击或回复其中的链接和电话。
          </p>
          {!fixing ? (
            <button className="secondary" onClick={() => { setFixing(true); setFixIds([]) }}>其实是寄给我们家人的</button>
          ) : (
            <div className="stack">
              <div>选择收件的家人:</div>
              {members.map((m) => (
                <label key={m.id} className="check">
                  <input type="checkbox" checked={fixIds.includes(m.id)}
                    onChange={(e) => setFixIds((c) => e.target.checked ? [...c, m.id] : c.filter((x) => x !== m.id))} />
                  {m.display_name}
                </label>
              ))}
              {me.role === 'admin' && <p className="muted small">只选一位时,会把信上的这个写法记为他/她的别名,以后自动识别。</p>}
              <div className="row">
                <button disabled={!fixIds.length} onClick={confirmRecipients}>确认</button>
                <button className="secondary" onClick={() => setFixing(false)}>取消</button>
              </div>
            </div>
          )}
        </div>
      )}

      {analyzing && <div className="card">🔍 AI 正在阅读这封信…通常需要 10–30 秒。</div>}
      {letter.status === 'failed' && (
        <div className="card warnbox">
          <p className="error">分析失败:{letter.error}</p>
          <button onClick={retry}>重新分析</button>
        </div>
      )}
      {err && <p className="error">{err}</p>}

      <section className="card stack">
        <div className="row between">
          <input className="titleinput" value={letter.title ?? ''} placeholder="标题"
            onChange={(e) => setLetter({ ...letter, title: e.target.value })}
            onBlur={(e) => patch({ title: e.target.value || null })} />
          <button className={`star big ${letter.is_important ? 'on' : ''}`} onClick={() => patch({ is_important: !letter.is_important })}>
            {letter.is_important ? '★' : '☆'}
          </button>
        </div>

        {letter.summary && <p className="summary">{letter.summary}</p>}

        <dl className="facts">
          <dt>寄件人</dt><dd>{letter.sender ?? '—'}</dd>
          <dt>收件人</dt><dd>{letter.recipient_name ?? '—'}</dd>
          <dt>地址</dt><dd>{letter.recipient_address ?? '—'}</dd>
          <dt>相关家人</dt><dd>{names(recipIds) || '—'}</dd>
          <dt>分类</dt>
          <dd>
            <select value={letter.category} onChange={(e) => patch({ category: e.target.value as Category })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </dd>
          <dt>截止日期</dt>
          <dd>
            <input type="date" value={letter.due_date ?? ''} onChange={(e) => patch({ due_date: e.target.value || null })} />
            {letter.due_date && <span className="muted"> {dueLabel(letter.due_date)}</span>}
          </dd>
          {letter.amount_due != null && (<><dt>金额</dt><dd>{formatMoney(letter.amount_due, letter.currency)}</dd></>)}
        </dl>

        <div className="row wrap">
          <label className="check">
            <span className="switch"><input type="checkbox" checked={letter.alert_enabled} onChange={(e) => patch({ alert_enabled: e.target.checked })} /><span /></span>
            到期提醒相关家人
          </label>
          <label className="check">
            <input type="checkbox" checked={letter.is_done} onChange={(e) => patch({ is_done: e.target.checked })} />
            已处理 / 已付款
          </label>
        </div>
      </section>

      {letter.full_text && (
        <section className="card stack">
          <div className="row between">
            <h3>完整内容</h3>
            <button className="link" onClick={() => setShowText(!showText)}>{showText ? '收起' : '展开'}</button>
          </div>
          {showText && <pre className="fulltext">{letter.full_text}</pre>}
          <p className="muted small">文字由 AI 转录,可能有误,重要内容请以原件为准。</p>
        </section>
      )}

      {letter.files.length > 0 && (
        <section className="card stack">
          <h3>原件</h3>
          {letter.files.map((f) => {
            const u = urls[f.path]
            if (!u) return <div key={f.path} className="muted">{f.name}(无法预览)</div>
            if (f.mime.startsWith('image/')) return <a key={f.path} href={u} target="_blank" rel="noreferrer"><img className="orig" src={u} alt={f.name} /></a>
            return <a key={f.path} className="btn secondary" href={u} target="_blank" rel="noreferrer">打开 {f.name}</a>
          })}
        </section>
      )}

      <div className="row">
        {letter.status === 'done' && <button className="secondary" onClick={retry}>重新分析</button>}
        <button className="danger" onClick={remove}>删除</button>
      </div>
    </div>
  )
}
