-- 审核通过时立即作废旧密码：管理员确认找回申请后，用户必须先设置新密码才能重新登录。
-- 这样即使用户关闭页面、换浏览器或清空本地数据，旧密码也无法继续登录。
create or replace function public.review_password_reset(p_request_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
    target_user uuid;
begin
    if not public.is_admin() then raise exception 'not authorized'; end if;

    update public.password_reset_requests
       set status = case when p_approve then '已确认' else '已拒绝' end,
           approved_at = now()
     where id = p_request_id and status = '待确认'
     returning user_id into target_user;

    if p_approve and target_user is not null then
        -- 写入一个无人知道的随机密码，使旧密码立即失效；只有 complete_password_reset 能设置新密码。
        update auth.users
           set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10)),
               updated_at = now()
         where id = target_user;

        delete from auth.sessions where user_id = target_user;
    end if;
end;
$$;
revoke all on function public.review_password_reset(uuid, boolean) from public, anon;
grant execute on function public.review_password_reset(uuid, boolean) to authenticated;
