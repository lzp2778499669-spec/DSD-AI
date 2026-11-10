-- 账号审核：新注册账号默认待审核，管理员把 profiles.access_status 改为 approved 后才可使用。
-- 仅在首次添加列时回填存量账号，避免重复执行把待审核用户误放行。
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'access_status'
    ) then
        alter table public.profiles add column access_status text not null default 'pending';
        alter table public.profiles add constraint profiles_access_status_check check (access_status in ('pending', 'approved', 'disabled'));
        update public.profiles set access_status = 'approved';
    end if;
end $$;

-- 资料修改统一走 security definer 函数 update_my_profile，移除直接更新策略，避免用户自行把审核状态改成 approved。
drop policy if exists "users update own profile" on public.profiles;
