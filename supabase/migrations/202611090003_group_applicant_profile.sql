-- 待审批申请人还不是组成员，无法命中「同组成员可查看资料」策略。
-- 允许组长查看申请加入自己组的用户资料，用于审批时展示昵称。
create policy "group owners view applicants" on public.profiles for select to authenticated using (
    exists (
        select 1
        from public.group_applications a
        join public.groups g on g.id = a.group_id
        where a.user_id = profiles.id and g.owner_id = (select auth.uid())
    )
);
