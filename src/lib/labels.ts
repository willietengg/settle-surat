import type { Category } from './types'

export const CATEGORY_LABEL: Record<Category, string> = {
  info: '通知',
  payment: '付款',
  government: '政府/税务',
  legal: '法律',
  medical: '医疗',
  bank: '银行',
  insurance: '保险',
  marketing: '广告',
  personal: '私人',
  other: '其他',
}

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[]

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return ''
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount)
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

export function dueLabel(due: string | null): string {
  const n = daysUntil(due)
  if (n == null) return ''
  if (n < 0) return `已逾期 ${-n} 天`
  if (n === 0) return '今天到期'
  return `${n} 天后到期`
}
