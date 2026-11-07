import { createClient } from '@supabase/supabase-js'

// 默认指向 settle-surat 这个 Supabase 项目;可用环境变量覆盖(如本地开发连别的项目)。
// anon key 是公开的(会出现在浏览器里),数据安全由数据库的行级权限(RLS)保证。
const DEFAULT_URL = 'https://ztsvljnpgkmzspirrrls.supabase.co'
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0c3Zsam5wZ2ttenNwaXJycmxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNjAzNDEsImV4cCI6MjEwOTYzNjM0MX0.KhYReOSpwrOlBjEbnEMrHYOrbJwC58HcpcjDJbA7Nlg'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY

export const configured = Boolean(url && key)

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
