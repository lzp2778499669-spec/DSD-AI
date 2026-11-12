-- 公共提示词：登录用户只读，新增与删除由 Supabase 后台（service role）维护。
create table if not exists public.prompts (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 200),
    prompt text not null check (char_length(prompt) between 1 and 20000),
    description text not null default '',
    cover_url text not null default '',
    category text not null default '',
    tags text[] not null default '{}',
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists prompts_created_at_idx on public.prompts (created_at desc);

alter table public.prompts enable row level security;

create policy "authenticated users read prompts" on public.prompts
    for select to authenticated using (true);

revoke insert, update, delete on public.prompts from anon, authenticated;
grant select on public.prompts to authenticated;

create or replace function public.touch_prompts_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists prompts_touch_updated_at on public.prompts;
create trigger prompts_touch_updated_at before update on public.prompts
for each row execute function public.touch_prompts_updated_at();

-- 后台新增示例（Supabase SQL Editor 或 Table Editor）：
-- insert into public.prompts (title, prompt, description, cover_url, category, tags)
-- values ('示例标题', '完整提示词内容', '可选描述', 'https://example.com/cover.jpg', '人物', array['生活', '插画']);
