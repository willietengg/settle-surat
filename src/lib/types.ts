import type { Lang } from './i18n'

export type Category =
  | 'info' | 'payment' | 'government' | 'legal' | 'medical'
  | 'bank' | 'insurance' | 'marketing' | 'personal' | 'other'

export interface LetterFile { path: string; mime: string; name?: string }

export interface Letter {
  id: string
  family_id: string
  uploaded_by: string | null
  title: string | null
  title_i18n: Partial<Record<Lang, string>>
  sender: string | null
  recipient_name: string | null
  recipient_address: string | null
  category: Category
  is_important: boolean
  is_suspicious: boolean
  action_required: boolean
  alert_enabled: boolean
  due_date: string | null
  amount_due: number | null
  currency: string | null
  summary: string | null
  summary_i18n: Partial<Record<Lang, string>>
  full_text: string | null
  language: string | null
  recipient_is_family: boolean | null
  is_generic_addressee: boolean
  is_done: boolean
  files: LetterFile[]
  status: 'pending' | 'processing' | 'done' | 'failed'
  error: string | null
  created_at: string
  updated_at: string
}

export type MemberStatus = 'pending' | 'verified' | 'declined'

export interface Member {
  id: string
  family_id: string
  user_id: string | null
  email: string | null
  title: string | null
  display_name: string
  aliases: string[]
  role: 'admin' | 'member'
  status: MemberStatus
}

export interface Family { id: string; name: string }

export type AddressKind = 'home' | 'work' | 'school' | 'custom'
export interface Address {
  id: string
  family_id: string
  kind: AddressKind
  custom_label: string | null
  address: string
}

export interface Invitation {
  member_id: string
  family_name: string
  host_name: string | null
  title: string | null
  display_name: string
}
