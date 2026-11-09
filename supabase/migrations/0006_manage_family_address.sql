-- Manage 页面:称谓 + 邀请状态(接受/拒绝)、地址簿、平台管理员管理、信件多语言标题/简介

-- ───────────── 成员:称谓 & 邀请状态 ─────────────
alter table public.members
  add column title text,
  add column status text not null default 'pending' check (status in ('pending', 'verified', 'declined'));
update public.members set status = 'verified' where user_id is not null;
-- 每个成员必须有账号或邮箱(邮箱用来邀请 / 验证)
alter table public.members add constraint members_email_or_user check (user_id is not null or email is not null);

-- host 可改的列加上 title;status / user_id 只能由下面的函数修改
revoke update on public.members from anon, authenticated;
grant update (display_name, aliases, role, email, title) on public.members to authenticated;

-- 改邮箱 = 重新邀请:状态回到 pending;已验证的成员不能改邮箱(否则会丢失登录关联)
create or replace function private.members_email_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.email is distinct from old.email then
    if old.user_id is not null then
      raise exception 'VERIFIED_EMAIL_LOCKED' using errcode = 'P0001';
    end if;
    new.email := lower(trim(new.email));
    new.status := 'pending';
  end if;
  return new;
end $$;
drop trigger if exists members_email_change on public.members;
create trigger members_email_change before update on public.members
  for each row execute function private.members_email_change();

-- 新邀请统一小写邮箱
create or replace function private.members_email_lower() returns trigger
language plpgsql set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists members_email_lower on public.members;
create trigger members_email_lower before insert on public.members
  for each row execute function private.members_email_lower();

-- 不再自动加入:被邀请的人登录后先看到邀请,自己选择接受或拒绝
drop function if exists public.claim_membership();

create or replace function public.my_invitations()
returns table (member_id uuid, family_name text, host_name text, title text, display_name text)
language sql stable security definer set search_path = public as $$
  select m.id, f.name,
         (select h.display_name from public.members h
           where h.family_id = f.id and h.role = 'admin' order by h.created_at limit 1),
         m.title, m.display_name
    from public.members m join public.families f on f.id = m.family_id
   where m.user_id is null and m.status = 'pending'
     and lower(m.email) = lower(auth.jwt() ->> 'email')
   order by m.created_at;
$$;

create or replace function public.respond_invitation(invitation uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into m from public.members
   where id = invitation and user_id is null and status = 'pending'
     and lower(email) = lower(auth.jwt() ->> 'email')
   for update;
  if not found then raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0001'; end if;

  if accept then
    if exists (select 1 from public.members where user_id = auth.uid()) then
      raise exception 'ALREADY_IN_FAMILY' using errcode = 'P0001';
    end if;
    update public.members set user_id = auth.uid(), status = 'verified' where id = invitation;
  else
    update public.members set status = 'declined' where id = invitation;
  end if;
end $$;

-- host 重新邀请(对方拒绝后改变主意,或邮件没收到):状态回到 pending
create or replace function public.reinvite_member(member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.members m set status = 'pending'
   where m.id = member and m.user_id is null and private.is_family_admin(m.family_id);
  if not found then raise exception 'forbidden'; end if;
end $$;

-- 自己改自己的称谓 / 全名(不能借此改角色)
create or replace function public.update_my_profile(new_title text, new_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  update public.members set title = nullif(trim(new_title), ''), display_name = trim(new_name)
   where user_id = auth.uid();
end $$;

-- create_family 增加称谓参数,创建者直接是已验证的 host
drop function if exists public.create_family(text, text, text);
create or replace function public.create_family(family_name text, my_name text, invite_code text default null, my_title text default null)
returns uuid language plpgsql security definer set search_path = public, private as $$
declare
  fid uuid;
  c text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'ALREADY_IN_FAMILY' using errcode = 'P0001';
  end if;
  if length(c) = 8 then c := substr(c, 1, 4) || '-' || substr(c, 5, 4); end if;

  if not public.is_platform_admin() then
    perform 1 from private.family_codes fc where fc.code = c and fc.used_at is null for update;
    if not found then raise exception 'INVALID_CODE' using errcode = 'P0001'; end if;
  end if;

  insert into public.families (name, created_by) values (family_name, auth.uid()) returning id into fid;
  insert into public.members (family_id, user_id, email, display_name, title, role, status)
  values (fid, auth.uid(), lower(auth.jwt() ->> 'email'), my_name, nullif(trim(my_title), ''), 'admin', 'verified');

  update private.family_codes fc set used_at = now(), used_by_family = fid
   where fc.code = c and fc.used_at is null;
  return fid;
end $$;

-- ───────────── 地址簿 ─────────────
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null default 'home' check (kind in ('home', 'work', 'school', 'custom')),
  custom_label text,
  address text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index addresses_family_idx on public.addresses (family_id);
alter table public.addresses enable row level security;
create policy addresses_select on public.addresses for select to authenticated
  using (private.is_family_member(family_id));
create policy addresses_insert on public.addresses for insert to authenticated
  with check (private.is_family_member(family_id));
create policy addresses_update on public.addresses for update to authenticated
  using (private.is_family_member(family_id)) with check (private.is_family_member(family_id));
create policy addresses_delete on public.addresses for delete to authenticated
  using (private.is_family_member(family_id));
grant select, insert, update, delete on public.addresses to authenticated;

-- ───────────── 信件:多语言标题 / 简介、诈骗标记 ─────────────
alter table public.letters
  add column title_i18n jsonb not null default '{}'::jsonb,
  add column summary_i18n jsonb not null default '{}'::jsonb,
  add column is_suspicious boolean not null default false;

-- ───────────── 平台管理员管理 ─────────────
create or replace function public.admin_list_admins()
returns table (email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, private as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query select a.email, a.created_at from private.platform_admins a order by a.created_at;
end $$;

create or replace function public.admin_add_admin(new_email text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if coalesce(trim(new_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;
  insert into private.platform_admins (email) values (lower(trim(new_email))) on conflict do nothing;
end $$;

create or replace function public.admin_remove_admin(old_email text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if lower(trim(old_email)) = lower(auth.jwt() ->> 'email') then
    raise exception 'CANNOT_REMOVE_SELF' using errcode = 'P0001';
  end if;
  delete from private.platform_admins where lower(email) = lower(trim(old_email));
end $$;

-- ───────────── 函数权限 ─────────────
revoke all on function private.members_email_change() from public, anon, authenticated;
revoke all on function private.members_email_lower() from public, anon, authenticated;
revoke all on function public.my_invitations() from public, anon;
revoke all on function public.respond_invitation(uuid, boolean) from public, anon;
revoke all on function public.update_my_profile(text, text) from public, anon;
revoke all on function public.reinvite_member(uuid) from public, anon;
revoke all on function public.create_family(text, text, text, text) from public, anon;
revoke all on function public.admin_list_admins() from public, anon;
revoke all on function public.admin_add_admin(text) from public, anon;
revoke all on function public.admin_remove_admin(text) from public, anon;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.respond_invitation(uuid, boolean) to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.reinvite_member(uuid) to authenticated;
grant execute on function public.create_family(text, text, text, text) to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_add_admin(text) to authenticated;
grant execute on function public.admin_remove_admin(text) to authenticated;
