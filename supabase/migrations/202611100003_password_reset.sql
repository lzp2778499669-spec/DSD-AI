-- 密码找回：用户提交申请，管理员确认后，用户凭一次性密钥设置新密码。
-- 前端不接触 service role；密码哈希与 auth.users 更新都在 security definer 函数内完成。
create table if not exists public.password_reset_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    username text not null,
    secret_hash text not null,
    status text not null default '待确认' check (status in ('待确认', '已确认', '已使用', '已拒绝')),
    created_at timestamptz not null default now(),
    approved_at timestamptz,
    used_at timestamptz
);

create index if not exists password_reset_requests_status_idx on public.password_reset_requests (status, created_at);
create index if not exists password_reset_requests_user_idx on public.password_reset_requests (user_id, status);

alter table public.password_reset_requests enable row level security;
revoke all on public.password_reset_requests from anon, authenticated;

-- 用户提交申请；同一账号只保留一条待处理申请。
create or replace function public.request_password_reset(p_username text, p_secret text)
returns table(request_id uuid, request_status text)
language plpgsql security definer set search_path = '' as $$
declare
    target_id uuid;
    target_username text;
    new_id uuid;
begin
    if char_length(coalesce(p_secret, '')) < 16 then raise exception 'invalid request secret'; end if;
    select p.id, p.username into target_id, target_username
      from public.profiles p
     where lower(p.username) = lower(trim(p_username))
     limit 1;
    if target_id is null then raise exception 'account not found'; end if;

    delete from public.password_reset_requests
     where user_id = target_id and status in ('待确认', '已确认');

    insert into public.password_reset_requests (user_id, username, secret_hash)
    values (target_id, target_username, extensions.crypt(p_secret, extensions.gen_salt('bf')))
    returning id into new_id;

    return query select new_id, '待确认'::text;
end;
$$;
revoke all on function public.request_password_reset(text, text) from public;
grant execute on function public.request_password_reset(text, text) to anon, authenticated;

-- 用户轮询申请状态；必须同时持有申请 ID 和一次性密钥。
create or replace function public.get_password_reset_status(p_request_id uuid, p_secret text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
    result text;
begin
    select status into result
      from public.password_reset_requests
     where id = p_request_id
       and secret_hash = extensions.crypt(p_secret, secret_hash)
     limit 1;
    if result is null then raise exception 'invalid reset request'; end if;
    return result;
end;
$$;
revoke all on function public.get_password_reset_status(uuid, text) from public;
grant execute on function public.get_password_reset_status(uuid, text) to anon, authenticated;

-- 管理员查看待确认申请。
create or replace function public.list_password_reset_requests()
returns table(id uuid, username text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
    if not public.is_admin() then raise exception 'not authorized'; end if;
    return query
      select r.id, r.username, r.created_at
        from public.password_reset_requests r
       where r.status = '待确认'
       order by r.created_at;
end;
$$;
revoke all on function public.list_password_reset_requests() from public, anon;
grant execute on function public.list_password_reset_requests() to authenticated;

-- 管理员确认或拒绝申请。
create or replace function public.review_password_reset(p_request_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
    if not public.is_admin() then raise exception 'not authorized'; end if;
    update public.password_reset_requests
       set status = case when p_approve then '已确认' else '已拒绝' end,
           approved_at = now()
     where id = p_request_id and status = '待确认';
end;
$$;
revoke all on function public.review_password_reset(uuid, boolean) from public, anon;
grant execute on function public.review_password_reset(uuid, boolean) to authenticated;

-- 用户设置新密码；仅已确认且 30 分钟内的申请可用。
create or replace function public.complete_password_reset(p_request_id uuid, p_secret text, p_new_password text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
    target_user uuid;
begin
    if char_length(coalesce(p_new_password, '')) < 6 then raise exception 'password too short'; end if;
    select r.user_id into target_user
      from public.password_reset_requests r
     where r.id = p_request_id
       and r.status = '已确认'
       and r.approved_at > now() - interval '30 minutes'
       and r.secret_hash = extensions.crypt(p_secret, r.secret_hash)
     limit 1;
    if target_user is null then raise exception 'reset request is not approved'; end if;

    update auth.users
       set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
           updated_at = now()
     where id = target_user;

    delete from auth.sessions where user_id = target_user;

    update public.password_reset_requests
       set status = '已使用', used_at = now()
     where id = p_request_id;
end;
$$;
revoke all on function public.complete_password_reset(uuid, text, text) from public;
grant execute on function public.complete_password_reset(uuid, text, text) to anon, authenticated;
