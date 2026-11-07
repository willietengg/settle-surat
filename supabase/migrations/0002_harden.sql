-- 安全加固(来自 Supabase security advisor):
-- 1) 权限辅助函数不应作为 /rest/v1/rpc 暴露 → 移到不对外的 private schema(RLS 策略按 OID 引用,自动跟随)
-- 2) 触发器函数固定 search_path
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_family_member(uuid) set schema private;
alter function public.is_family_admin(uuid) set schema private;
alter function private.is_family_member(uuid) set search_path = public;
alter function private.is_family_admin(uuid) set search_path = public;
revoke all on function private.is_family_member(uuid) from public, anon;
revoke all on function private.is_family_admin(uuid) from public, anon;
grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.is_family_admin(uuid) to authenticated;

alter function public.touch_updated_at() set search_path = public;
