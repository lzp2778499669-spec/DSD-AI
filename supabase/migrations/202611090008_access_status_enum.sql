-- 审核状态改为中文 Postgres 枚举，Supabase 表格编辑器显示为「待审核 / 已通过 / 未通过」下拉。
-- 007 的外键方案会让编辑器展开整张选项表，这里改为枚举并移除选项表。
alter table public.profiles drop constraint if exists profiles_access_status_fkey;
alter table public.groups drop constraint if exists groups_access_status_fkey;
alter table public.profiles drop constraint if exists profiles_access_status_check;
alter table public.groups drop constraint if exists groups_access_status_check;

create type public.access_status as enum ('待审核', '已通过', '未通过');

alter table public.profiles alter column access_status drop default;
alter table public.profiles alter column access_status type public.access_status using (
    case access_status
        when 'approved' then '已通过'
        when 'disabled' then '未通过'
        else '待审核'
    end
)::public.access_status;
alter table public.profiles alter column access_status set default '待审核'::public.access_status;

alter table public.groups alter column access_status drop default;
alter table public.groups alter column access_status type public.access_status using (
    case access_status
        when 'approved' then '已通过'
        when 'disabled' then '未通过'
        else '待审核'
    end
)::public.access_status;
alter table public.groups alter column access_status set default '待审核'::public.access_status;

drop table if exists public.access_status_options;

create or replace function public.is_group_approved(target_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.groups g where g.id = target_group and g.access_status = '已通过');
$$;
revoke all on function public.is_group_approved(uuid) from public;
grant execute on function public.is_group_approved(uuid) to authenticated;

drop policy if exists "members and owners read groups" on public.groups;
create policy "members and owners read groups" on public.groups for select to authenticated using ((owner_id = (select auth.uid()) and access_status <> '待审核') or (public.is_group_approved(id) and public.is_group_member(id)));

create or replace function public.search_groups(group_query text)
returns table(id uuid, name text) language sql stable security definer set search_path = '' as $$
    select g.id, g.name from public.groups g where g.access_status = '已通过' and char_length(trim(group_query)) > 0 and g.name ilike '%' || replace(replace(trim(group_query), '%', '\%'), '_', '\_') || '%' order by g.created_at desc limit 20;
$$;
revoke all on function public.search_groups(text) from public;
grant execute on function public.search_groups(text) to authenticated;

create or replace function public.list_pending_profiles()
returns table (id uuid, username text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
    select p.id, p.username, p.created_at
    from public.profiles p
    where p.access_status = '待审核'
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
    if next_status not in ('已通过', '未通过') then
        raise exception 'invalid status';
    end if;
    update public.profiles set access_status = next_status::public.access_status, updated_at = now() where id = target_id;
end;
$$;
revoke all on function public.review_profile(uuid, text) from public;
grant execute on function public.review_profile(uuid, text) to authenticated;
