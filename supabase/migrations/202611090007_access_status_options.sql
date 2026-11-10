-- 审核状态选项表：给 profiles.access_status 与 groups.access_status 建立外键，
-- 让 Supabase 表格编辑器以外键下拉框的方式修改状态，避免手输。
create table if not exists public.access_status_options (
    value text primary key,
    label text not null
);

insert into public.access_status_options (value, label) values
    ('pending', 'Pending review'),
    ('approved', 'Approved'),
    ('disabled', 'Rejected')
on conflict (value) do update set label = excluded.label;

alter table public.access_status_options enable row level security;
drop policy if exists "authenticated read access status options" on public.access_status_options;
create policy "authenticated read access status options" on public.access_status_options for select to authenticated using (true);

alter table public.profiles drop constraint if exists profiles_access_status_fkey;
alter table public.profiles add constraint profiles_access_status_fkey foreign key (access_status) references public.access_status_options(value);

alter table public.groups drop constraint if exists groups_access_status_fkey;
alter table public.groups add constraint groups_access_status_fkey foreign key (access_status) references public.access_status_options(value);
