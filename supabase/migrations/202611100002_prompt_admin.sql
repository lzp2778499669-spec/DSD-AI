-- 管理员在应用内维护公共提示词，并可上传公开封面。
-- 提示词写入权限仍由 public.is_admin() 约束，普通用户只能读取。
grant insert, update, delete on public.prompts to authenticated;

drop policy if exists "admins insert prompts" on public.prompts;
create policy "admins insert prompts" on public.prompts
    for insert to authenticated with check (public.is_admin());

drop policy if exists "admins update prompts" on public.prompts;
create policy "admins update prompts" on public.prompts
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete prompts" on public.prompts;
create policy "admins delete prompts" on public.prompts
    for delete to authenticated using (public.is_admin());

-- 公开封面桶：图片可通过公共 URL 直接访问，只有管理员能上传和删除。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prompt-covers', 'prompt-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "prompt covers public read" on storage.objects;
create policy "prompt covers public read" on storage.objects
    for select using (bucket_id = 'prompt-covers');

drop policy if exists "admins upload prompt covers" on storage.objects;
create policy "admins upload prompt covers" on storage.objects
    for insert to authenticated with check (bucket_id = 'prompt-covers' and public.is_admin());

drop policy if exists "admins update prompt covers" on storage.objects;
create policy "admins update prompt covers" on storage.objects
    for update to authenticated using (bucket_id = 'prompt-covers' and public.is_admin()) with check (bucket_id = 'prompt-covers' and public.is_admin());

drop policy if exists "admins delete prompt covers" on storage.objects;
create policy "admins delete prompt covers" on storage.objects
    for delete to authenticated using (bucket_id = 'prompt-covers' and public.is_admin());

-- 删除分类：把使用该分类的提示词改为未分类。
create or replace function public.clear_prompt_category(category_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.is_admin() then raise exception 'not authorized'; end if;
    update public.prompts set category = '' where category = category_name;
end;
$$;
revoke all on function public.clear_prompt_category(text) from public, anon;
grant execute on function public.clear_prompt_category(text) to authenticated;

-- 删除标签：从所有提示词中移除该标签。
create or replace function public.remove_prompt_tag(tag_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.is_admin() then raise exception 'not authorized'; end if;
    update public.prompts set tags = array_remove(tags, tag_name) where tag_name = any(tags);
end;
$$;
revoke all on function public.remove_prompt_tag(text) from public, anon;
grant execute on function public.remove_prompt_tag(text) to authenticated;
