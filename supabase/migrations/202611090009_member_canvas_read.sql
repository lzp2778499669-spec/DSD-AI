-- 组员只读浏览对方画布：读取对方已同步到云端的画布状态，不再需要手动发布。
-- 同时允许同组成员读取对方 user-data 目录下的画布图片。
create or replace function public.get_member_canvas_state(member_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select s.payload
    from public.user_state s
    where s.user_id = member_id
      and s.domain = 'canvas'
      and exists (
          select 1
          from public.group_members mine
          join public.group_members theirs on theirs.group_id = mine.group_id
          join public.groups g on g.id = mine.group_id
          where mine.user_id = (select auth.uid())
            and theirs.user_id = member_id
            and g.access_status = '已通过'
      );
$$;
revoke all on function public.get_member_canvas_state(uuid) from public;
grant execute on function public.get_member_canvas_state(uuid) to authenticated;

drop policy if exists "group members read member files" on storage.objects;
create policy "group members read member files" on storage.objects for select to authenticated using (
    bucket_id = 'user-data'
    and exists (
        select 1
        from public.group_members mine
        join public.group_members theirs on theirs.group_id = mine.group_id
        join public.groups g on g.id = mine.group_id
        where mine.user_id = (select auth.uid())
          and theirs.user_id = ((storage.foldername(storage.objects.name))[1])::uuid
          and g.access_status = '已通过'
    )
);

-- 删除发布功能：清理组内画布快照、存储文件和相关策略。
drop policy if exists "group members read published canvas files" on storage.objects;
drop policy if exists "members upload own group canvas files" on storage.objects;
drop policy if exists "members update own group canvas files" on storage.objects;
drop policy if exists "members delete own group canvas files" on storage.objects;
delete from storage.objects where bucket_id = 'group-canvases';
drop table if exists public.group_canvases;
delete from storage.buckets where id = 'group-canvases';
