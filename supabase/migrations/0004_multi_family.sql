-- 多家庭平台:开通码 + 每月额度 + 平台管理员
-- 任何人都能登录,但创建家庭需要平台管理员发放的「开通码」;每个家庭每月 AI 分析次数有上限。

-- ───────────── 撤销「只限一个邮箱注册」 ─────────────
drop trigger if exists enforce_invite_only on auth.users;
drop function if exists private.enforce_invite_only();
drop table if exists private.signup_allowlist;

-- ───────────── 平台管理员 ─────────────
create table private.platform_admins (
  email text primary key,
  created_at timestamptz not null default now()
);
insert into private.platform_admins (email) values ('willietengfx@gmail.com') on conflict do nothing;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from private.platform_admins a where lower(a.email) = lower(auth.jwt() ->> 'email'));
$$;

-- ───────────── 家庭的方案 & 额度 ─────────────
alter table public.families
  add column plan text not null default 'trial' check (plan in ('trial', 'free', 'paid', 'suspended')),
  add column monthly_limit integer not null default 100 check (monthly_limit >= 0);

-- 家庭管理员只能改家庭名称,不能自己改方案/额度
revoke update on public.families from anon, authenticated;
grant update (name) on public.families to authenticated;

-- ───────────── 成员表加固(多家庭场景) ─────────────
-- 新增成员只能是「待认领」(user_id 为空),不能把别人的账号直接塞进自己家
drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert to authenticated
  with check (private.is_family_admin(family_id) and user_id is null);
-- 只能改这些列;user_id / family_id 只能由 claim_membership 设置
revoke update on public.members from anon, authenticated;
grant update (display_name, aliases, role, email) on public.members to authenticated;

-- ───────────── 开通码 ─────────────
create table private.family_codes (
  code text primary key,
  note text,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by_family uuid references public.families(id) on delete set null
);

create or replace function private.new_code() returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 去掉易混淆的 0/O/1/I
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 10, 11]; -- 避开 uuid 的版本/变体位
  s text := '';
begin
  for i in 1..8 loop
    s := s || substr(alphabet, (get_byte(b, idx[i]) % 32) + 1, 1);
    if i = 4 then s := s || '-'; end if;
  end loop;
  return s;
end $$;

-- 创建家庭:平台管理员可免码,其他人必须提供未使用的开通码
drop function if exists public.create_family(text, text);
create or replace function public.create_family(family_name text, my_name text, invite_code text default null)
returns uuid language plpgsql security definer set search_path = public, private as $$
declare
  fid uuid;
  c text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if length(c) = 8 then c := substr(c, 1, 4) || '-' || substr(c, 5, 4); end if;

  if not public.is_platform_admin() then
    perform 1 from private.family_codes fc where fc.code = c and fc.used_at is null for update;
    if not found then raise exception 'INVALID_CODE' using errcode = 'P0001'; end if;
  end if;

  insert into public.families (name, created_by) values (family_name, auth.uid()) returning id into fid;
  insert into public.members (family_id, user_id, email, display_name, role)
  values (fid, auth.uid(), lower(auth.jwt() ->> 'email'), my_name, 'admin');

  update private.family_codes fc set used_at = now(), used_by_family = fid
   where fc.code = c and fc.used_at is null;
  return fid;
end $$;

-- ───────────── 每月用量 ─────────────
create table private.analysis_usage (
  family_id uuid not null references public.families(id) on delete cascade,
  month date not null,
  count integer not null default 0,
  primary key (family_id, month)
);

-- 原子地占用一次额度;额度用完或家庭被停用则返回 false。由 analyze-letter 函数在调用 AI 前调用。
create or replace function public.consume_analysis_quota(fid uuid)
returns boolean language plpgsql security definer set search_path = public, private as $$
declare
  m date := (date_trunc('month', now() at time zone 'utc'))::date;
  lim int; pl text; used int;
begin
  if not private.is_family_member(fid) then raise exception 'forbidden'; end if;
  select monthly_limit, plan into lim, pl from public.families where id = fid;
  if pl = 'suspended' then return false; end if;
  insert into private.analysis_usage (family_id, month, count) values (fid, m, 0) on conflict do nothing;
  update private.analysis_usage set count = count + 1
   where family_id = fid and month = m and count < lim
  returning count into used;
  return used is not null;
end $$;

create or replace function public.get_family_usage(fid uuid)
returns table (used integer, monthly_limit integer, plan text)
language sql stable security definer set search_path = public, private as $$
  select coalesce((select u.count from private.analysis_usage u
                    where u.family_id = f.id and u.month = (date_trunc('month', now() at time zone 'utc'))::date), 0),
         f.monthly_limit, f.plan
    from public.families f
   where f.id = fid and private.is_family_member(fid);
$$;

-- ───────────── 平台管理员 RPC ─────────────
create or replace function public.admin_create_codes(how_many integer, note text default null)
returns setof text language plpgsql security definer set search_path = public, private as $$
declare c text;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if how_many < 1 or how_many > 50 then raise exception 'how_many must be 1..50'; end if;
  for i in 1..how_many loop
    loop
      c := private.new_code();
      begin
        insert into private.family_codes (code, note) values (c, nullif(trim(admin_create_codes.note), ''));
        exit;
      exception when unique_violation then -- 极少数撞码,重试
      end;
    end loop;
    return next c;
  end loop;
end $$;

create or replace function public.admin_list_codes()
returns table (code text, note text, created_at timestamptz, used_at timestamptz, family_name text)
language plpgsql stable security definer set search_path = public, private as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select fc.code, fc.note, fc.created_at, fc.used_at, f.name
      from private.family_codes fc left join public.families f on f.id = fc.used_by_family
     order by fc.created_at desc;
end $$;

create or replace function public.admin_list_families()
returns table (id uuid, name text, plan text, monthly_limit integer, members bigint, letters bigint,
               used_this_month integer, owner_email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, private as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select f.id, f.name, f.plan, f.monthly_limit,
           (select count(*) from public.members m where m.family_id = f.id),
           (select count(*) from public.letters l where l.family_id = f.id),
           coalesce((select u.count from private.analysis_usage u
                      where u.family_id = f.id and u.month = (date_trunc('month', now() at time zone 'utc'))::date), 0),
           (select m.email from public.members m where m.family_id = f.id and m.role = 'admin' order by m.created_at limit 1),
           f.created_at
      from public.families f
     order by f.created_at desc;
end $$;

create or replace function public.admin_update_family(fid uuid, new_plan text, new_limit integer)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  update public.families set plan = new_plan, monthly_limit = new_limit where id = fid;
end $$;

-- ───────────── 函数权限 ─────────────
revoke all on function private.new_code() from public, anon, authenticated;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.create_family(text, text, text) from public, anon;
revoke all on function public.consume_analysis_quota(uuid) from public, anon;
revoke all on function public.get_family_usage(uuid) from public, anon;
revoke all on function public.admin_create_codes(integer, text) from public, anon;
revoke all on function public.admin_list_codes() from public, anon;
revoke all on function public.admin_list_families() from public, anon;
revoke all on function public.admin_update_family(uuid, text, integer) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.create_family(text, text, text) to authenticated;
grant execute on function public.consume_analysis_quota(uuid) to authenticated;
grant execute on function public.get_family_usage(uuid) to authenticated;
grant execute on function public.admin_create_codes(integer, text) to authenticated;
grant execute on function public.admin_list_codes() to authenticated;
grant execute on function public.admin_list_families() to authenticated;
grant execute on function public.admin_update_family(uuid, text, integer) to authenticated;
