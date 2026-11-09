import { supabase } from './supabase'
import type { LetterFile } from './types'
import type { Key } from './i18n'

/** 带翻译键的错误,由界面按当前语言显示 */
export class AppError extends Error {
  constructor(public key: Key, public vars: Record<string, string | number> = {}) {
    super(key)
  }
}

const MAX_EDGE = 2000       // 手机照片缩到最长边 2000px,清晰度足够读字,体积小很多
const JPEG_QUALITY = 0.85
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const ACCEPT =
  'image/*,application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type Kind = 'image' | 'pdf' | 'docx' | 'unsupported'

export function kindOf(f: File): Kind {
  const n = f.name.toLowerCase()
  if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif)$/.test(n)) return 'image'
  if (f.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (n.endsWith('.docx')) return 'docx'
  return 'unsupported'
}

/** 压缩/转码为 JPEG(同时处理 EXIF 方向)。浏览器无法解码的格式(如部分 HEIC)会抛错。 */
export async function compressImage(file: File): Promise<File> {
  if (file.type === 'image/gif') return file
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY),
  )
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}

export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value.trim()
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-㐀-鿿]+/g, '_').slice(-80) || 'file'
}

export interface Prepared { uploads: { file: File; mime: string; name: string }[]; extraText: string }

/** 把用户选的文件整理成可上传的形式:图片压缩,docx 提取文字(不上传原文件以外的转换物)。 */
export async function prepare(files: File[]): Promise<Prepared> {
  const uploads: Prepared['uploads'] = []
  const texts: string[] = []
  for (const f of files) {
    const kind = kindOf(f)
    if (kind === 'unsupported') throw new AppError('err.unsupported', { name: f.name })
    if (kind === 'image') {
      const out = await compressImage(f).catch(() => {
        throw new AppError('err.image', { name: f.name })
      })
      uploads.push({ file: out, mime: out.type, name: out.name })
    } else if (kind === 'pdf') {
      uploads.push({ file: f, mime: 'application/pdf', name: f.name })
    } else {
      texts.push(await extractDocxText(f))
      uploads.push({
        file: f,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        name: f.name,
      })
    }
  }
  for (const u of uploads) {
    if (u.file.size > MAX_UPLOAD_BYTES) throw new AppError('err.tooLarge', { name: u.name })
  }
  return { uploads, extraText: texts.join('\n\n---\n\n') }
}

export async function uploadFiles(
  familyId: string,
  letterId: string,
  uploads: Prepared['uploads'],
): Promise<LetterFile[]> {
  const out: LetterFile[] = []
  for (let i = 0; i < uploads.length; i++) {
    const u = uploads[i]
    const path = `${familyId}/${letterId}/${String(i + 1).padStart(2, '0')}-${safeName(u.name)}`
    const { error } = await supabase.storage.from('letters').upload(path, u.file, {
      contentType: u.mime, upsert: false,
    })
    if (error) throw new AppError('err.upload', { msg: error.message })
    out.push({ path, mime: u.mime, name: u.name })
  }
  return out
}

/** 私有文件通过短期签名链接显示(1 小时),不会公开。 */
export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('letters').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** 重试分析时,重新从存储里取出 .docx 并提取文字。 */
export async function docxTextFromStorage(files: LetterFile[]): Promise<string> {
  const texts: string[] = []
  for (const f of files) {
    if (f.mime !== DOCX) continue
    const { data, error } = await supabase.storage.from('letters').download(f.path)
    if (error || !data) throw new AppError('err.readFile', { name: f.name ?? f.path })
    texts.push(await extractDocxText(new File([data], f.name ?? 'doc.docx')))
  }
  return texts.join('\n\n---\n\n')
}

/** 任意异常 → 当前语言的提示 */
export function errorMessage(t: (k: Key, v?: Record<string, string | number>) => string, e: unknown): string {
  if (e instanceof AppError) return t(e.key, e.vars)
  return e instanceof Error ? e.message : String(e)
}
