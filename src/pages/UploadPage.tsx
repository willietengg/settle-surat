import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import { ACCEPT, kindOf, prepare, uploadFiles } from '../lib/files'

export default function UploadPage() {
  const { family } = useApp()
  const nav = useNavigate()
  const [files, setFiles] = useState<File[]>([])
  const [separate, setSeparate] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)

  const previews = useMemo(
    () => files.map((f) => (kindOf(f) === 'image' ? URL.createObjectURL(f) : null)),
    [files],
  )

  function add(list: FileList | null) {
    if (!list) return
    setFiles((cur) => [...cur, ...Array.from(list)])
    setErr('')
  }

  async function createLetter(group: File[]) {
    const { uploads, extraText } = await prepare(group)
    const { data, error } = await supabase.from('letters').insert({ family_id: family.id }).select('id').single()
    if (error || !data) throw new Error(error?.message ?? '创建失败')
    const letterId = data.id as string
    const stored = await uploadFiles(family.id, letterId, uploads)
    const upd = await supabase.from('letters').update({ files: stored }).eq('id', letterId)
    if (upd.error) throw new Error(upd.error.message)
    // 触发 AI 分析:不等待完成(列表页会轮询状态)
    void supabase.functions.invoke('analyze-letter', { body: { letter_id: letterId, extra_text: extraText } })
      .then(({ error }) => {
        if (error) void supabase.from('letters').update({ status: 'failed', error: 'AI 分析请求失败,可在详情页重试' }).eq('id', letterId)
      })
    return letterId
  }

  async function submit() {
    if (!files.length) return
    setErr('')
    try {
      const groups = separate ? files.map((f) => [f]) : [files]
      let last = ''
      for (let i = 0; i < groups.length; i++) {
        setBusy(`上传中 ${i + 1}/${groups.length}…`)
        last = await createLetter(groups[i])
      }
      nav(groups.length === 1 ? `/letters/${last}` : '/')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="card stack">
      <h2>添加信件</h2>
      <div className="row wrap">
        <button onClick={() => cameraRef.current?.click()}>📷 拍照</button>
        <button className="secondary" onClick={() => pickRef.current?.click()}>📎 选择照片 / PDF / Word</button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden
        onChange={(e) => { add(e.target.files); e.target.value = '' }} />

      {files.length > 0 && (
        <>
          <ul className="filelist">
            {files.map((f, i) => (
              <li key={i}>
                {previews[i] ? <img src={previews[i]!} alt="" /> : <span className="doc">{kindOf(f) === 'pdf' ? 'PDF' : 'DOC'}</span>}
                <span className="grow ellipsis">{f.name}</span>
                <button className="link" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}>移除</button>
              </li>
            ))}
          </ul>
          <p className="muted small">多页信件可以连续拍多张,它们会作为<b>同一封信</b>处理。</p>
          {files.length > 1 && (
            <label className="check">
              <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} />
              每个文件是一封独立的信(批量添加)
            </label>
          )}
          <button disabled={!!busy} onClick={submit}>{busy || `开始分析(${files.length} 个文件)`}</button>
        </>
      )}
      {err && <p className="error">{err}</p>}
      <p className="muted small">文件会存放在你们家的私有空间,并发送给 AI 读取内容用于整理;不会公开。</p>
    </div>
  )
}
