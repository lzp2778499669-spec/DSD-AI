-- 管理员审核：管理员表、待审核列表与批准/拒绝函数。
-- 只有 admins 表中的用户能查看待审核列表和执行审核；前端入口只做展示控制，权限由函数校验。
create table if not exists public.admins (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.list_pending_profiles()
returns table (id uuid, username text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
    select p.id, p.username, p.created_at
    from public.profiles p
    where p.access_status = 'pending'
      and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    order by p.created_at;
$$;
revoke all on function public.list_pending_profiles() from public;
grant execute on function public.list_pending_profiles() to authenticated;

create or replace function public.review_profile(target_id uuid, next_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
        raise exception 'not authorized';
    end if;
    if next_status not in ('approved', 'disabled') then
        raise exception 'invalid status';
    end if;
    update public.profiles set access_status = next_status, updated_at = now() where id = target_id;
end;
$$;
revoke all on function public.review_profile(uuid, text) from public;
grant execute on function public.review_profile(uuid, text) to authenticated;

-- 初始化管理员账号，已存在则跳过。
insert into public.admins (user_id)
select p.id from public.profiles p where p.username = '1142551510'
on conflict (user_id) do nothing;
