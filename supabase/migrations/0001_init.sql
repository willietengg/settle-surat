-- 家庭信件管家:初始 schema
-- 原则:所有数据都按 family_id 隔离,只有该家庭的成员(members.user_id = 当前登录用户)能读写。

create extension if not exists pgcrypto;

-- ───────────── 家庭 & 成员 ─────────────
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- members 同时表示「已登录的家人」和「只出现在信上、没有账号的家人(如小孩)」。
-- 邀请 = 管理员新增一行 members(email=对方邮箱, user_id=null);对方用该邮箱登录后自动认领。
create table public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  display_name text not null,
  -- 信上可能出现的其他写法,如 "W. Teng"、"Teng Willie"、中文名。用于判断收件人是不是家人。
  aliases text[] not null default '{}',
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);
create unique index members_family_user_uidx on public.members (family_id, user_id) where user_id is not null;
create unique index members_family_email_uidx on public.members (family_id, lower(email)) where email is not null;
create index members_user_idx on public.members (user_id);

-- ───────────── 权限辅助函数(security definer 避免 RLS 递归) ─────────────
create or replace function public.is_family_member(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.family_id = fid and m.user_id = auth.uid());
$$;

create or replace function public.is_family_admin(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m
                 where m.family_id = fid and m.user_id = auth.uid() and m.role = 'admin');
$$;

-- 创建家庭并把自己设为管理员(普通 insert 会被 RLS 拦住,因为此时还不是成员)
create or replace function public.create_family(family_name text, my_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.families (name, created_by) values (family_name, auth.uid()) returning id into fid;
  insert into public.members (family_id, user_id, email, display_name, role)
  values (fid, auth.uid(), lower(auth.jwt() ->> 'email'), my_name, 'admin');
  return fid;
end $$;

-- 被邀请的人用邀请的邮箱登录后,认领属于自己的成员行。
-- 只信任 JWT 里已验证的邮箱(魔法链接 / Google 都会验证邮箱)。
create or replace function public.claim_membership()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is null then return 0; end if;
  update public.members
     set user_id = auth.uid()
   where user_id is null and lower(email) = lower(auth.jwt() ->> 'email');
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.create_family(text, text) from public, anon;
revoke all on function public.claim_membership() from public, anon;
grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.claim_membership() to authenticated;

-- ───────────── 信件 ─────────────
create table public.letters (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),

  -- 以下由 AI 自动填写,用户可以手动修改
  title text,
  sender text,
  recipient_name text,          -- 信封/抬头上的收件人原文
  recipient_address text,
  category text not null default 'other'
    check (category in ('info','payment','government','legal','medical','bank','insurance','marketing','personal','other')),
  is_important boolean not null default false,
  action_required boolean not null default false,
  alert_enabled boolean not null default false,   -- 开启后会提醒「相关的人」
  due_date date,
  amount_due numeric(12,2),
  currency text,
  summary text,
  full_text text,
  language text,

  -- null = 还没分析;false = 收件人不是任何家庭成员 → 前端显示警告
  recipient_is_family boolean,
  is_generic_addressee boolean not null default false, -- "Current Resident" 之类
  is_done boolean not null default false,               -- 已处理 / 已付款

  files jsonb not null default '[]'::jsonb,             -- [{path, mime, name}]
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index letters_family_created_idx on public.letters (family_id, created_at desc);
create index letters_family_due_idx on public.letters (family_id, due_date) where alert_enabled and not is_done;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger letters_touch before update on public.letters
  for each row execute function public.touch_updated_at();

-- 这封信「相关的人」= 收件人里匹配到的家庭成员;提醒会发给他们
create table public.letter_recipients (
  letter_id uuid not null references public.letters(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  primary key (letter_id, member_id)
);

-- ───────────── RLS ─────────────
alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.letters enable row level security;
alter table public.letter_recipients enable row level security;

create policy families_select on public.families for select to authenticated
  using (public.is_family_member(id));
create policy families_update on public.families for update to authenticated
  using (public.is_family_admin(id)) with check (public.is_family_admin(id));

create policy members_select on public.members for select to authenticated
  using (public.is_family_member(family_id));
create policy members_insert on public.members for insert to authenticated
  with check (public.is_family_admin(family_id));
create policy members_update on public.members for update to authenticated
  using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
create policy members_delete on public.members for delete to authenticated
  using (public.is_family_admin(family_id));

create policy letters_select on public.letters for select to authenticated
  using (public.is_family_member(family_id));
create policy letters_insert on public.letters for insert to authenticated
  with check (public.is_family_member(family_id) and uploaded_by = auth.uid());
create policy letters_update on public.letters for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy letters_delete on public.letters for delete to authenticated
  using (public.is_family_member(family_id));

create policy lr_select on public.letter_recipients for select to authenticated
  using (exists (select 1 from public.letters l where l.id = letter_id and public.is_family_member(l.family_id)));
create policy lr_insert on public.letter_recipients for insert to authenticated
  with check (
    exists (select 1 from public.letters l where l.id = letter_id and public.is_family_member(l.family_id))
    and exists (select 1 from public.letters l join public.members m on m.family_id = l.family_id
                where l.id = letter_id and m.id = member_id)
  );
create policy lr_delete on public.letter_recipients for delete to authenticated
  using (exists (select 1 from public.letters l where l.id = letter_id and public.is_family_member(l.family_id)));

-- ───────────── 私有文件存储 ─────────────
-- 路径约定:{family_id}/{letter_id}/{文件名};只有该家庭成员能读写。
insert into storage.buckets (id, name, public) values ('letters', 'letters', false)
on conflict (id) do update set public = false;

create policy letters_files_select on storage.objects for select to authenticated
  using (bucket_id = 'letters' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy letters_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'letters' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy letters_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'letters' and public.is_family_member(((storage.foldername(name))[1])::uuid));
