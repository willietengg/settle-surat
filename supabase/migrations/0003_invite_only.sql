-- 仅限邀请:只有以下邮箱能注册账号
--   1) private.signup_allowlist 里的邮箱(家庭创建者)
--   2) 已被某个家庭管理员添加到 members 的邮箱(被邀请的家人)
-- 其他人即使拿到网址,也无法注册 / 登录。邮箱和 Google 登录都经过这里。
create table if not exists private.signup_allowlist (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);
insert into private.signup_allowlist (email, note)
values ('willietengfx@gmail.com', '家庭创建者')
on conflict (email) do nothing;

create or replace function private.enforce_invite_only()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.email is not null and (
       exists (select 1 from private.signup_allowlist a where lower(a.email) = lower(new.email))
    or exists (select 1 from public.members m where lower(m.email) = lower(new.email))
  ) then
    return new;
  end if;
  raise exception 'SIGNUP_NOT_INVITED' using errcode = 'P0001';
end $$;

revoke all on function private.enforce_invite_only() from public, anon, authenticated;

drop trigger if exists enforce_invite_only on auth.users;
create trigger enforce_invite_only before insert on auth.users
  for each row execute function private.enforce_invite_only();
