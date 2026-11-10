-- 组审核：新建的组默认待审核，平台管理员在 Supabase 中改为 approved 后才可使用。
-- 待审核的组对创建者也不显示；被拒绝（disabled）的组保留并标记为未通过。
-- 仅在首次添加列时回填存量组，避免重复执行把待审核组误放行。
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'groups' and column_name = 'access_status'
    ) then
        alter table public.groups add column access_status text not null default 'pending';
        alter table public.groups add constraint groups_access_status_check check (access_status in ('pending', 'approved', 'disabled'));
        update public.groups set access_status = 'approved';
    end if;
end $$;

create or replace function public.is_group_approved(target_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.groups g where g.id = target_group and g.access_status = 'approved');
$$;
revoke all on function public.is_group_approved(uuid) from public;
grant execute on function public.is_group_approved(uuid) to authenticated;

-- 组长只能看到已通过或未通过的组，待审核的组不显示；组成员只能看到已通过的组。
drop policy if exists "members and owners read groups" on public.groups;
create policy "members and owners read groups" on public.groups for select to authenticated using ((owner_id = (select auth.uid()) and access_status <> 'pending') or (public.is_group_approved(id) and public.is_group_member(id)));

-- 每人只能创建一个组。
create or replace function public.create_group(group_name text, invite_code text)
returns public.groups language plpgsql security definer set search_path = '' as $$
declare created public.groups;
begin
    if auth.uid() is null or char_length(trim(group_name)) not between 1 and 80 or char_length(invite_code) < 8 then raise exception 'invalid group request'; end if;
    if exists (select 1 from public.groups g where g.owner_id = auth.uid()) then raise exception 'each user can only create one group'; end if;
    insert into public.groups(name, owner_id) values (trim(group_name), auth.uid()) returning * into created;
    insert into public.group_invite_secrets(group_id, invite_code_hash) values (created.id, extensions.crypt(invite_code, extensions.gen_salt('bf')));
    insert into public.group_members(group_id, user_id, role) values (created.id, auth.uid(), 'owner');
    return created;
end;
$$;
revoke all on function public.create_group(text, text) from public;
grant execute on function public.create_group(text, text) to authenticated;

-- 组名搜索只返回已通过审核的组。
create or replace function public.search_groups(group_query text)
returns table(id uuid, name text) language sql stable security definer set search_path = '' as $$
    select g.id, g.name from public.groups g where g.access_status = 'approved' and char_length(trim(group_query)) > 0 and g.name ilike '%' || replace(replace(trim(group_query), '%', '\%'), '_', '\_') || '%' order by g.created_at desc limit 20;
$$;
revoke all on function public.search_groups(text) from public;
grant execute on function public.search_groups(text) to authenticated;

-- 申请加入前校验组已通过审核。
create or replace function public.apply_to_group(target_group uuid, invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare application_id uuid;
begin
    if auth.uid() is null or not public.is_group_approved(target_group) then raise exception 'group not available'; end if;
    if not exists (select 1 from public.group_invite_secrets s where s.group_id = target_group and s.invite_code_hash = extensions.crypt(invite_code, s.invite_code_hash)) then raise exception 'invalid invite code'; end if;
    if exists (select 1 from public.group_members m where m.group_id = target_group and m.user_id = auth.uid()) then raise exception 'already a group member'; end if;
    insert into public.group_applications(group_id, user_id) values (target_group, auth.uid())
    on conflict (group_id, user_id) do update set created_at = now()
    returning id into application_id;
    return application_id;
end;
$$;
revoke all on function public.apply_to_group(uuid, text) from public;
grant execute on function public.apply_to_group(uuid, text) to authenticated;

-- 组长审批申请时再次校验组已通过审核。
create or replace function public.review_group_application(application_id uuid, approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare application public.group_applications;
begin
    select * into application from public.group_applications where id = application_id for update;
    if not found or not public.is_group_owner(application.group_id) then raise exception 'not group owner'; end if;
    if approve then
        if not public.is_group_approved(application.group_id) then raise exception 'group not approved'; end if;
        insert into public.group_members(group_id, user_id, role) values (application.group_id, application.user_id, 'member') on conflict do nothing;
    end if;
    delete from public.group_applications where id = application_id;
end;
$$;
revoke all on function public.review_group_application(uuid, boolean) from public;
grant execute on function public.review_group_application(uuid, boolean) to authenticated;

drop policy if exists "group members view roster" on public.group_members;
create policy "group members view roster" on public.group_members for select to authenticated using ((public.is_group_approved(group_id) and public.is_group_member(group_id)) or public.is_group_owner(group_id));

drop policy if exists "members read group canvases" on public.group_canvases;
create policy "members read group canvases" on public.group_canvases for select to authenticated using (public.is_group_approved(group_id) and public.is_group_member(group_id));

drop policy if exists "members publish own canvas" on public.group_canvases;
create policy "members publish own canvas" on public.group_canvases for insert to authenticated with check (owner_id = (select auth.uid()) and public.is_group_approved(group_id) and public.is_group_member(group_id));

drop policy if exists "owners publish own canvas" on public.group_canvases;
create policy "owners publish own canvas" on public.group_canvases for update to authenticated using (owner_id = (select auth.uid()) and public.is_group_approved(group_id) and public.is_group_member(group_id)) with check (owner_id = (select auth.uid()) and public.is_group_approved(group_id) and public.is_group_member(group_id));

drop policy if exists "owners remove own canvas" on public.group_canvases;
create policy "owners remove own canvas" on public.group_canvases for delete to authenticated using (owner_id = (select auth.uid()) and public.is_group_approved(group_id) and public.is_group_member(group_id));

drop policy if exists "group members read published canvas files" on storage.objects;
create policy "group members read published canvas files" on storage.objects for select to authenticated using (bucket_id = 'group-canvases' and public.is_group_approved(((storage.foldername(name))[1])::uuid) and public.is_group_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "members upload own group canvas files" on storage.objects;
create policy "members upload own group canvas files" on storage.objects for insert to authenticated with check (bucket_id = 'group-canvases' and (storage.foldername(name))[2] = (select auth.uid())::text and public.is_group_approved(((storage.foldername(name))[1])::uuid) and public.is_group_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "members update own group canvas files" on storage.objects;
create policy "members update own group canvas files" on storage.objects for update to authenticated using (bucket_id = 'group-canvases' and (storage.foldername(name))[2] = (select auth.uid())::text and public.is_group_approved(((storage.foldername(name))[1])::uuid) and public.is_group_member(((storage.foldername(name))[1])::uuid)) with check (bucket_id = 'group-canvases' and (storage.foldername(name))[2] = (select auth.uid())::text and public.is_group_approved(((storage.foldername(name))[1])::uuid) and public.is_group_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "members delete own group canvas files" on storage.objects;
create policy "members delete own group canvas files" on storage.objects for delete to authenticated using (bucket_id = 'group-canvases' and (storage.foldername(name))[2] = (select auth.uid())::text and public.is_group_approved(((storage.foldername(name))[1])::uuid) and public.is_group_member(((storage.foldername(name))[1])::uuid));
