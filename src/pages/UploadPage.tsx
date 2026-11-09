import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { ACCEPT, AppError, errorMessage, kindOf, prepare, uploadFiles } from '../lib/files'
import { IconCamera, IconClip } from '../components/Icons'
import { Link } from 'react-router-dom'

export default function UploadPage() {
  const { family } = useApp()
  const { t } = useI18n()
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
    if (error || !data) throw new AppError('err.create', { msg: error?.message ?? '' })
    const letterId = data.id as string
    const stored = await uploadFiles(family.id, letterId, uploads)
    const upd = await supabase.from('letters').update({ files: stored }).eq('id', letterId)
    if (upd.error) throw new AppError('err.create', { msg: upd.error.message })
    // 触发 AI 分析:不等待完成(首页会轮询状态)。函数自己会把失败原因写回信件;这里只处理连不上的情况
    void supabase.functions.invoke('analyze-letter', { body: { letter_id: letterId, extra_text: extraText } })
      .then(async ({ error }) => {
        if (!error) return
        const { data: row } = await supabase.from('letters').select('status').eq('id', letterId).single()
        if (row && row.status !== 'failed' && row.status !== 'done') {
          await supabase.from('letters').update({ status: 'failed', error: 'REQUEST_FAILED' }).eq('id', letterId)
        }
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
        setBusy(t('upload.uploading', { i: i + 1, n: groups.length }))
        last = await createLetter(groups[i])
      }
      nav(groups.length === 1 ? `/letters/${last}` : '/')
    } catch (e) {
      setErr(errorMessage(t, e))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack gap-lg">
      <Link to="/" className="backlink">{t('detail.back')}</Link>
      <h1 className="display">{t('upload.title')}</h1>
      <div className="card stack">
      <div className="pick-grid">
        <button className="pick-tile primary-tile" onClick={() => cameraRef.current?.click()}><IconCamera width={30} height={30} /><span>{t('upload.camera')}</span></button>
        <button className="pick-tile" onClick={() => pickRef.current?.click()}><IconClip width={30} height={30} /><span>{t('upload.pick')}</span></button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden
        onChange={(e) => { add(e.target.files); e.target.value = '' }} />

      {files.length > 0 && (
        <>
          <ul className="filelist">
            {files.map((f, i) => (
              <li key={i} className="appear" style={{ ['--i' as string]: i }}>
                {previews[i] ? <img src={previews[i]!} alt="" /> : <span className="doc">{kindOf(f) === 'pdf' ? 'PDF' : 'DOC'}</span>}
                <span className="grow ellipsis">{f.name}</span>
                <button className="link" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}>{t('common.remove')}</button>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('upload.multiHint')}</p>
          {files.length > 1 && (
            <label className="check">
              <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} />
              {t('upload.separate')}
            </label>
          )}
          <button disabled={!!busy} onClick={submit}>{busy || t('upload.start', { n: files.length })}</button>
        </>
      )}
      {err && <p className="error">{err}</p>}
      <p className="muted small">{t('upload.privacy')}</p>
      </div>
    </div>
  )
}
