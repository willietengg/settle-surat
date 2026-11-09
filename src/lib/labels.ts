import type { Address, Category, Letter } from './types'
import { LOCALE, type Lang, type T } from './i18n'

export const CATEGORIES: Category[] = [
  'info', 'payment', 'government', 'legal', 'medical', 'bank', 'insurance', 'marketing', 'personal', 'other',
]

export const catLabel = (t: T, c: Category) => t(`cat.${c}`)

export function addressLabel(t: T, a: Pick<Address, 'kind' | 'custom_label'>): string {
  return a.kind === 'custom' ? (a.custom_label?.trim() || t('kind.custom')) : t(`kind.${a.kind}`)
}

export function letterTitle(t: T, lang: Lang, l: Letter): string {
  return l.title_i18n?.[lang] || l.title || t('letter.untitled')
}
export function letterSummary(lang: Lang, l: Letter): string {
  return l.summary_i18n?.[lang] || l.summary || ''
}

export function formatMoney(lang: Lang, amount: number | null, currency: string | null): string {
  if (amount == null) return ''
  try {
    return new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: currency || 'MYR' }).format(amount)
  } catch {
    return `${currency ?? ''} ${amount.toFixed(2)}`.trim()
  }
}

/** 距离到期还有几天(负数 = 已逾期);无日期返回 null。按本地日期计算。 */
export function daysUntil(due: string | null, now = new Date()): number | null {
  if (!due) return null
  const [y, m, d] = due.split('-').map(Number)
  if (!y || !m || !d) return null
  const target = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86_400_000)
}

export function dueLabel(t: T, due: string | null): string {
  const n = daysUntil(due)
  if (n == null) return ''
  if (n < 0) return t('due.overdue', { n: -n })
  if (n === 0) return t('due.today')
  return t('due.inDays', { n })
}
