-- 组共享 AI 配置：渠道元数据存放在 groups.ai_config，渠道密钥单独加密存放在 group_channel_secrets。
-- 组配置只允许通过 channel-secrets Edge Function 读写，避免成员直接改库或把密钥明文落库。
alter table public.groups
    add column if not exists ai_config jsonb not null default '{}'::jsonb;
