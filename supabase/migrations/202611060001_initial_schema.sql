create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique check (char_length(username) between 3 and 80),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.user_state (
    user_id uuid not null references auth.users(id) on delete cascade,
    domain text not null check (domain in ('account', 'canvas', 'assets', 'config', 'image-workbench', 'video-workbench', 'prompt-sources')),
    payload jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (user_id, domain)
);

alter table public.user_state enable row level security;
create policy "users read own non-secret state" on public.user_state for select to authenticated using ((select auth.uid()) = user_id and domain <> 'config');
create policy "users manage own non-secret state" on public.user_state for all to authenticated using ((select auth.uid()) = user_id and domain <> 'config') with check ((select auth.uid()) = user_id and domain <> 'config');

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    insert into public.profiles (id, username)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)));
    insert into public.user_state (user_id, domain, payload)
    values (new.id, 'account', jsonb_build_object('profile', jsonb_build_object('id', new.id, 'name', coalesce(new.raw_user_meta_data ->> 'username', ''), 'email', '', 'avatarUrl', ''), 'credits', 0, 'membership', jsonb_build_object('planId', 'free', 'planName', '普通用户', 'expiresAt', ''), 'records', '[]'::jsonb, 'plans', '[]'::jsonb));
    return new;
end;
$$;

create or replace function public.save_my_config(config_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then raise exception 'not authenticated'; end if;
    insert into public.user_state(user_id, domain, payload, updated_at)
    values (auth.uid(), 'config', config_payload, now())
    on conflict (user_id, domain) do update set payload = excluded.payload, updated_at = now();
end;
$$;
revoke all on function public.save_my_config(jsonb) from public, anon;
grant execute on function public.save_my_config(jsonb) to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table if not exists public.groups (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 80),
    owner_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now()
);
create index if not exists groups_name_search_idx on public.groups using gin (to_tsvector('simple', name));

create table if not exists public.group_members (
    group_id uuid not null references public.groups(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    role text not null check (role in ('owner', 'member')),
    created_at timestamptz not null default now(),
    primary key (group_id, user_id)
);

create table if not exists public.group_invite_secrets (
    group_id uuid primary key references public.groups(id) on delete cascade,
    invite_code_hash text not null
);
alter table public.group_invite_secrets enable row level security;
revoke all on public.group_invite_secrets from anon, authenticated;

create table if not exists public.group_applications (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (group_id, user_id)
);

create table if not exists public.group_canvases (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete cascade,
    owner_id uuid not null references public.profiles(id) on delete cascade,
    project_id text not null,
    title text not null,
    storage_path text not null,
    updated_at timestamptz not null default now(),
    unique (group_id, owner_id, project_id)
);

create table if not exists public.group_channel_secrets (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete cascade,
    channel_id text not null,
    encrypted_payload text not null,
    updated_at timestamptz not null default now(),
    unique (group_id, channel_id)
);

create table if not exists public.user_channel_secrets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    channel_id text not null,
    encrypted_payload text not null,
    updated_at timestamptz not null default now(),
    unique (user_id, channel_id)
);
alter table public.user_channel_secrets enable row level security;
revoke all on public.user_channel_secrets from anon, authenticated;

create or replace function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.group_members m where m.group_id = target_group and m.user_id = (select auth.uid()));
$$;
create or replace function public.is_group_owner(target_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.groups g where g.id = target_group and g.owner_id = (select auth.uid()));
$$;
revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_owner(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
create policy "authenticated users view profiles" on public.profiles for select to authenticated using (id = (select auth.uid()) or exists (select 1 from public.group_members mine join public.group_members theirs using (group_id) where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id));
create policy "users update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function public.update_my_profile(profile_name text, profile_avatar text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then raise exception 'not authenticated'; end if;
    update public.profiles set username = trim(profile_name), updated_at = now() where id = auth.uid();
    update public.user_state set payload = jsonb_set(jsonb_set(payload, '{profile,name}', to_jsonb(trim(profile_name)), true), '{profile,avatarUrl}', to_jsonb(profile_avatar), true), updated_at = now() where user_id = auth.uid() and domain = 'account';
end;
$$;
revoke all on function public.update_my_profile(text, text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;

create or replace function public.get_my_account()
returns jsonb language sql stable security definer set search_path = '' as $$
    select payload from public.user_state where user_id = (select auth.uid()) and domain = 'account';
$$;
revoke all on function public.get_my_account() from public;
grant execute on function public.get_my_account() to authenticated;

create or replace function public.get_my_config()
returns jsonb language sql stable security definer set search_path = '' as $$
    select payload from public.user_state where user_id = (select auth.uid()) and domain = 'config';
$$;
revoke all on function public.get_my_config() from public, anon;
grant execute on function public.get_my_config() to authenticated;

alter table public.groups enable row level security;
create policy "members and owners read groups" on public.groups for select to authenticated using (owner_id = (select auth.uid()) or public.is_group_member(id));
revoke insert, update, delete on public.groups from anon, authenticated;
revoke insert, update, delete on public.group_members from anon, authenticated;
revoke insert, update, delete on public.group_applications from anon, authenticated;
create policy "owners update groups" on public.groups for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners delete groups" on public.groups for delete to authenticated using (owner_id = (select auth.uid()));

alter table public.group_members enable row level security;
create policy "group members view roster" on public.group_members for select to authenticated using (public.is_group_member(group_id) or public.is_group_owner(group_id));
create policy "owners remove group members" on public.group_members for delete to authenticated using (public.is_group_owner(group_id) and user_id <> (select auth.uid()));

alter table public.group_applications enable row level security;
create policy "applicant and owner view applications" on public.group_applications for select to authenticated using (user_id = (select auth.uid()) or public.is_group_owner(group_id));
create policy "applicant withdraws or owner rejects" on public.group_applications for delete to authenticated using (user_id = (select auth.uid()) or public.is_group_owner(group_id));

alter table public.group_canvases enable row level security;
create policy "members read group canvases" on public.group_canvases for select to authenticated using (public.is_group_member(group_id));
create policy "members publish own canvas" on public.group_canvases for insert to authenticated with check (owner_id = (select auth.uid()) and public.is_group_member(group_id));
create policy "owners publish own canvas" on public.group_canvases for update to authenticated using (owner_id = (select auth.uid()) and public.is_group_member(group_id)) with check (owner_id = (select auth.uid()) and public.is_group_member(group_id));
create policy "owners remove own canvas" on public.group_canvases for delete to authenticated using (owner_id = (select auth.uid()) and public.is_group_member(group_id));

alter table public.group_channel_secrets enable row level security;
revoke all on public.group_channel_secrets from anon, authenticated;
alter table public.user_channel_secrets enable row level security;
revoke all on public.user_channel_secrets from anon, authenticated;

create or replace function public.create_group(group_name text, invite_code text)
returns public.groups language plpgsql security definer set search_path = '' as $$
declare created public.groups;
begin
    if auth.uid() is null or char_length(trim(group_name)) not between 1 and 80 or char_length(invite_code) < 8 then raise exception 'invalid group request'; end if;
    insert into public.groups(name, owner_id) values (trim(group_name), auth.uid()) returning * into created;
    insert into public.group_invite_secrets(group_id, invite_code_hash) values (created.id, extensions.crypt(invite_code, extensions.gen_salt('bf')));
    insert into public.group_members(group_id, user_id, role) values (created.id, auth.uid(), 'owner');
    return created;
end;
$$;

create or replace function public.search_groups(group_query text)
returns table(id uuid, name text) language sql stable security definer set search_path = '' as $$
    select g.id, g.name from public.groups g where char_length(trim(group_query)) > 0 and g.name ilike '%' || replace(replace(trim(group_query), '%', '\%'), '_', '\_') || '%' order by g.created_at desc limit 20;
$$;

create or replace function public.apply_to_group(target_group uuid, invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare application_id uuid;
begin
    if auth.uid() is null or not exists (select 1 from public.group_invite_secrets s where s.group_id = target_group and s.invite_code_hash = extensions.crypt(invite_code, s.invite_code_hash)) then raise exception 'invalid invite code'; end if;
    insert into public.group_applications(group_id, user_id) values (target_group, auth.uid()) returning id into application_id;
    return application_id;
end;
$$;

create or replace function public.review_group_application(application_id uuid, approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare application public.group_applications;
begin
    select * into application from public.group_applications where id = application_id for update;
    if not found or not public.is_group_owner(application.group_id) then raise exception 'not group owner'; end if;
    if approve then insert into public.group_members(group_id, user_id, role) values (application.group_id, application.user_id, 'member') on conflict do nothing; end if;
    delete from public.group_applications where id = application_id;
end;
$$;

create or replace function public.leave_group(target_group uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null or (auth.uid() <> target_user and not public.is_group_owner(target_group)) then raise exception 'not authorized'; end if;
    delete from public.group_members where group_id = target_group and user_id = target_user and role <> 'owner';
end;
$$;

revoke all on function public.create_group(text, text) from public;
revoke all on function public.search_groups(text) from public;
revoke all on function public.apply_to_group(uuid, text) from public;
revoke all on function public.review_group_application(uuid, boolean) from public;
revoke all on function public.leave_group(uuid, uuid) from public;
revoke all on function public.create_group(text, text) from anon;
revoke all on function public.apply_to_group(uuid, text) from anon;
revoke all on function public.review_group_application(uuid, boolean) from anon;
revoke all on function public.leave_group(uuid, uuid) from anon;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.search_groups(text) to authenticated;
grant execute on function public.apply_to_group(uuid, text) to authenticated;
grant execute on function public.review_group_application(uuid, boolean) to authenticated;
grant execute on function public.leave_group(uuid, uuid) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit)
values ('user-data', 'user-data', false, null), ('group-canvases', 'group-canvases', false, null)
on conflict (id) do nothing;

create policy "users manage own private files" on storage.objects for all to authenticated using (bucket_id = 'user-data' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'user-data' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "group members read published canvas files" on storage.objects for select to authenticated using (bucket_id = 'group-canvases' and public.is_group_member(((storage.foldername(name))[1])::uuid));
create policy "members upload own group canvas files" on storage.objects for insert to authenticated with check (bucket_id = 'group-canvases' and (storage.foldername(name))[2] = (select auth.uid())::text and public.is_group_member(((storage.foldername(name))[1])::uuid));

create policy "members update own group canvas files" on storage.objects for update to authenticated using (bucket_id = 'group-canvases' and (storage.foldername(name))[2] = (select auth.uid())::text and public.is_group_member(((storage.foldername(name))[1])::uuid)) with check (bucket_id = 'group-canvases' and (storage.foldername(name))[2] = (select auth.uid())::text and public.is_group_member(((storage.foldername(name))[1])::uuid));
create policy "members delete own group canvas files" on storage.objects for delete to authenticated using (bucket_id = 'group-canvases' and (storage.foldername(name))[2] = (select auth.uid())::text and public.is_group_member(((storage.foldername(name))[1])::uuid));

create or replace function public.save_group_channel(channel_id text, secret_payload bytea)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_group uuid; secret_id uuid;
begin
    target_group := (current_setting('request.headers', true)::jsonb ->> 'x-group-id')::uuid;
    if target_group is null or not public.is_group_owner(target_group) then raise exception 'not group owner'; end if;
    insert into public.group_channel_secrets(group_id, channel_id, encrypted_payload) values (target_group, channel_id, secret_payload)
    on conflict (group_id, channel_id) do update set encrypted_payload = excluded.encrypted_payload, updated_at = now() returning id into secret_id;
    return secret_id;
end;
$$;
revoke all on function public.save_group_channel(text, bytea) from public;
grant execute on function public.save_group_channel(text, bytea) to authenticated;
