-- 修复重复申请：同一用户重复提交时刷新申请时间，而不是触发唯一约束错误。
-- 已是组成员时直接拒绝，避免产生无意义的待审批记录。
create or replace function public.apply_to_group(target_group uuid, invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare application_id uuid;
begin
    if auth.uid() is null or not exists (select 1 from public.group_invite_secrets s where s.group_id = target_group and s.invite_code_hash = extensions.crypt(invite_code, s.invite_code_hash)) then raise exception 'invalid invite code'; end if;
    if exists (select 1 from public.group_members m where m.group_id = target_group and m.user_id = auth.uid()) then raise exception 'already a group member'; end if;
    insert into public.group_applications(group_id, user_id) values (target_group, auth.uid())
    on conflict (group_id, user_id) do update set created_at = now()
    returning id into application_id;
    return application_id;
end;
$$;
