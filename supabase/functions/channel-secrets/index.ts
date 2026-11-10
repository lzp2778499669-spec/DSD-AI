import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const MAX_CONFIG_BYTES = 1_000_000;
const MAX_CHANNELS = 30;
const MAX_MODELS_PER_CHANNEL = 100;
const MAX_MODEL_SCRIPT_LENGTH = 100_000;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(value: unknown, options: { status?: number } = {}) {
    return Response.json(value, { ...options, headers: corsHeaders });
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const secretKey = Deno.env.get("CHANNEL_SECRET_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !secretKey) return json({ error: "密钥服务尚未配置" }, { status: 503 });
    const authorization = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "请先登录" }, { status: 401 });

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return json({ error: "请求格式无效" }, { status: 400 });
    }
    if (JSON.stringify(body).length > MAX_CONFIG_BYTES * 2) return json({ error: "请求内容过大" }, { status: 413 });

    const service = createClient(supabaseUrl, serviceKey);
    const action = body.action;
    if (action === "group-save" || action === "group-load") return handleGroupAction({ action, body, userId: user.id, service, secretKey });
    return handleUserChannelAction({ action, body, userId: user.id, service, secretKey });
});

async function handleUserChannelAction({ action, body, userId, service, secretKey }: {
    action: unknown;
    body: Record<string, unknown>;
    userId: string;
    service: ReturnType<typeof createClient>;
    secretKey: string;
}) {
    if (action === "load-many") {
        const channelIds = body.channelIds;
        if (!Array.isArray(channelIds) || channelIds.length > 100 || channelIds.some((id) => typeof id !== "string" || id.length > 100)) return json({ error: "渠道列表无效" }, { status: 400 });
        if (!channelIds.length) return json({ secrets: {} });
        const { data, error } = await service.from("user_channel_secrets").select("channel_id,encrypted_payload").eq("user_id", userId).in("channel_id", channelIds);
        if (error) return json({ error: "读取渠道配置失败" }, { status: 500 });
        const secrets: Record<string, string> = {};
        for (const item of data || []) {
            try {
                secrets[item.channel_id] = await decrypt(String(item.encrypted_payload), secretKey);
            } catch {
                // 单个密钥损坏时跳过，避免整份配置无法加载。
            }
        }
        return json({ secrets });
    }

    const channelId = body.channelId;
    if (typeof channelId !== "string" || channelId.length > 100) return json({ error: "渠道标识无效" }, { status: 400 });
    if (action === "save") {
        const apiKey = body.apiKey;
        if (typeof apiKey !== "string" || apiKey.length > 4096) return json({ error: "API Key 无效" }, { status: 400 });
        const encrypted = await encrypt(apiKey, secretKey);
        const { error } = await service.from("user_channel_secrets").upsert({ user_id: userId, channel_id: channelId, encrypted_payload: encrypted }, { onConflict: "user_id,channel_id" });
        if (error) return json({ error: "保存渠道密钥失败" }, { status: 500 });
        return json({ saved: true });
    }
    if (action === "status") {
        const { data, error } = await service.from("user_channel_secrets").select("id").eq("user_id", userId).eq("channel_id", channelId).maybeSingle();
        if (error) return json({ error: "读取渠道状态失败" }, { status: 500 });
        return json({ configured: Boolean(data) });
    }
    if (action === "delete") {
        const { error } = await service.from("user_channel_secrets").delete().eq("user_id", userId).eq("channel_id", channelId);
        if (error) return json({ error: "删除渠道密钥失败" }, { status: 500 });
        return json({ deleted: true });
    }
    return json({ error: "操作无效" }, { status: 400 });
}

async function handleGroupAction({ action, body, userId, service, secretKey }: {
    action: "group-save" | "group-load";
    body: Record<string, unknown>;
    userId: string;
    service: ReturnType<typeof createClient>;
    secretKey: string;
}) {
    const groupId = body.groupId;
    if (typeof groupId !== "string" || !/^[0-9a-f-]{36}$/i.test(groupId)) return json({ error: "组标识无效" }, { status: 400 });

    const { data: group, error: groupError } = await service.from("groups").select("owner_id, ai_config, access_status").eq("id", groupId).maybeSingle();
    if (groupError) return json({ error: "读取组信息失败" }, { status: 500 });
    if (!group) return json({ error: "组不存在" }, { status: 404 });
    if (group.access_status !== "已通过") return json({ error: "组尚未通过审核" }, { status: 403 });

    if (action === "group-save") {
        if (group.owner_id !== userId) return json({ error: "只有组长可以修改组配置" }, { status: 403 });
        const normalized = normalizeGroupConfig(body.config);
        if (!normalized) return json({ error: "组配置格式无效" }, { status: 400 });

        const { data: existingSecrets, error: secretError } = await service.from("group_channel_secrets").select("channel_id").eq("group_id", groupId);
        if (secretError) return json({ error: "读取组密钥失败" }, { status: 500 });
        const existingIds = new Set((existingSecrets || []).map((item) => item.channel_id as string));

        for (const channel of normalized.channels) {
            if (!channel.apiKey) continue;
            const encrypted = await encrypt(channel.apiKey, secretKey);
            const { error } = await service.from("group_channel_secrets").upsert(
                { group_id: groupId, channel_id: channel.id, encrypted_payload: encrypted, updated_at: new Date().toISOString() },
                { onConflict: "group_id,channel_id" },
            );
            if (error) return json({ error: `保存渠道 ${channel.name} 的密钥失败` }, { status: 500 });
            existingIds.add(channel.id);
        }

        const keepIds = new Set(normalized.channels.map((channel) => channel.id));
        const removedIds = Array.from(existingIds).filter((id) => !keepIds.has(id));
        if (removedIds.length) {
            const { error } = await service.from("group_channel_secrets").delete().eq("group_id", groupId).in("channel_id", removedIds);
            if (error) return json({ error: "清理旧渠道密钥失败" }, { status: 500 });
        }

        const storedConfig = {
            ...normalized.config,
            apiKey: "",
            channels: normalized.channels.map(({ apiKey: _apiKey, ...channel }) => ({ ...channel, apiKey: "", apiKeyConfigured: keepIds.has(channel.id) && (existingIds.has(channel.id) || Boolean(_apiKey)) })),
        };
        const { error: updateError } = await service.from("groups").update({ ai_config: storedConfig }).eq("id", groupId);
        if (updateError) return json({ error: "保存组配置失败" }, { status: 500 });
        return json({ saved: true });
    }

    const { data: membership, error: memberError } = await service.from("group_members").select("user_id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
    if (memberError) return json({ error: "校验组成员失败" }, { status: 500 });
    if (!membership) return json({ error: "你不是该组成员" }, { status: 403 });

    const stored = normalizeStoredGroupConfig(group.ai_config);
    if (!stored) return json({ config: null });
    const isOwner = group.owner_id === userId;
    // 指定了成员的渠道只对该成员和组长可见。
    const visibleChannels = isOwner ? stored.channels : stored.channels.filter((channel) => !channel.assignedUserId || channel.assignedUserId === userId);
    if (!visibleChannels.length) return json({ config: null });
    const { data: secrets, error: secretError } = await service.from("group_channel_secrets").select("channel_id, encrypted_payload").eq("group_id", groupId);
    if (secretError) return json({ error: "读取组密钥失败" }, { status: 500 });
    const apiKeyByChannel = new Map<string, string>();
    for (const item of secrets || []) {
        try {
            apiKeyByChannel.set(item.channel_id as string, await decrypt(item.encrypted_payload as string, secretKey));
        } catch {
            // 单个密钥损坏时仍返回其余配置，避免整个组无法使用。
        }
    }
    const channels = visibleChannels.map((channel) => ({
        ...channel,
        apiKey: apiKeyByChannel.get(channel.id) || "",
        apiKeyConfigured: apiKeyByChannel.has(channel.id),
    }));
    const config: Record<string, unknown> = { ...stored, apiKey: "", channels };
    if (!isOwner) {
        // 默认模型如果指向不可见渠道，自动回退到当前成员可见的第一个模型。
        const visibleIds = new Set(channels.map((channel) => channel.id));
        const pickModel = (capability: "image" | "video" | "text") => {
            for (const channel of channels) {
                const model = channel.models.find((item) => item.capability === capability);
                if (model) return `${channel.id}::${model.name}`;
            }
            return "";
        };
        const keepModel = (value: unknown, capability: "image" | "video" | "text") => {
            const text = typeof value === "string" ? value : "";
            return text && visibleIds.has(text.split("::")[0]) ? text : pickModel(capability);
        };
        config.imageModel = keepModel(stored.imageModel, "image");
        config.videoModel = keepModel(stored.videoModel, "video");
        config.textModel = keepModel(stored.textModel, "text");
    }
    return json({ config });
}

type NormalizedChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiFormat: "openai" | "openai-chat" | "gemini";
    models: Array<{ name: string; capability: "image" | "video" | "text"; script?: string }>;
    apiKey?: string;
    apiKeyConfigured?: boolean;
    assignedUserId?: string;
};

function normalizeApiFormat(value: unknown): "openai" | "openai-chat" | "gemini" {
    return value === "gemini" || value === "openai-chat" ? value : "openai";
}

function normalizeGroupConfig(value: unknown): { config: Record<string, unknown>; channels: NormalizedChannel[] } | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const input = value as Record<string, unknown>;
    const rawChannels = Array.isArray(input.channels) ? input.channels.slice(0, MAX_CHANNELS) : [];
    const channels: NormalizedChannel[] = [];
    const seen = new Set<string>();
    rawChannels.forEach((rawChannel, index) => {
        const item = rawChannel && typeof rawChannel === "object" ? (rawChannel as Record<string, unknown>) : {};
        const id = readText(item.id, 100) || `channel-${index + 1}`;
        if (seen.has(id)) return;
        seen.add(id);
        const models = (Array.isArray(item.models) ? item.models : []).slice(0, MAX_MODELS_PER_CHANNEL).flatMap((rawModel) => {
            const model = rawModel && typeof rawModel === "object" ? (rawModel as Record<string, unknown>) : {};
            const name = readText(model.name, 200);
            if (!name || !["image", "video", "text"].includes(String(model.capability))) return [];
            const script = readText(model.script, MAX_MODEL_SCRIPT_LENGTH).trim();
            return [{ name, capability: model.capability as "image" | "video" | "text", ...(script ? { script } : {}) }];
        });
        channels.push({
            id,
            name: readText(item.name, 120) || `渠道 ${index + 1}`,
            baseUrl: readText(item.baseUrl, 2000),
            apiFormat: normalizeApiFormat(item.apiFormat),
            models,
            apiKey: readText(item.apiKey, 4096).trim() || undefined,
            assignedUserId: readText(item.assignedUserId, 64) || undefined,
        });
    });
    const apiFormat = normalizeApiFormat(input.apiFormat);
    const config: Record<string, unknown> = {
        channelMode: "local",
        baseUrl: readText(input.baseUrl, 2000),
        apiKey: "",
        apiFormat,
        channels: [],
        model: readText(input.model, 300),
        imageModel: readText(input.imageModel, 300),
        videoModel: readText(input.videoModel, 300),
        textModel: readText(input.textModel, 300),
        videoSeconds: readText(input.videoSeconds, 20),
        vquality: readText(input.vquality, 20),
        videoGenerateAudio: readText(input.videoGenerateAudio, 10),
        videoWatermark: readText(input.videoWatermark, 10),
        videoMode: input.videoMode === "reference" ? "reference" : "frames",
        systemPrompt: readText(input.systemPrompt, 20_000),
        reasoningEffort: ["auto", "low", "medium", "high", "xhigh"].includes(String(input.reasoningEffort)) ? input.reasoningEffort : "auto",
        models: channels.flatMap((channel) => channel.models.map((model) => `${channel.id}::${model.name}`)),
        quality: readText(input.quality, 20),
        size: readText(input.size, 50),
        background: readText(input.background, 50),
        count: readText(input.count, 10),
        canvasImageCount: readText(input.canvasImageCount, 10),
        proxyEnabled: Boolean(input.proxyEnabled),
        proxyUrl: readText(input.proxyUrl, 2000),
        nodeRegenerateBehavior: input.nodeRegenerateBehavior === "overwrite" ? "overwrite" : "new-node",
        autoFocusOnSelect: Boolean(input.autoFocusOnSelect),
    };
    if (JSON.stringify(config).length > MAX_CONFIG_BYTES) return null;
    return { config, channels };
}

function normalizeStoredGroupConfig(value: unknown): { channels: NormalizedChannel[] } & Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const input = value as Record<string, unknown>;
    const channels = (Array.isArray(input.channels) ? input.channels : []).flatMap((rawChannel, index) => {
        const item = rawChannel && typeof rawChannel === "object" ? (rawChannel as Record<string, unknown>) : {};
        const id = readText(item.id, 100) || `channel-${index + 1}`;
        const models = (Array.isArray(item.models) ? item.models : []).flatMap((rawModel) => {
            const model = rawModel && typeof rawModel === "object" ? (rawModel as Record<string, unknown>) : {};
            const name = readText(model.name, 200);
            const capability = model.capability;
            if (!name || !["image", "video", "text"].includes(String(capability))) return [];
            const script = readText(model.script, MAX_MODEL_SCRIPT_LENGTH).trim();
            return [{ name, capability: capability as "image" | "video" | "text", ...(script ? { script } : {}) }];
        });
        return [{
            id,
            name: readText(item.name, 120) || `渠道 ${index + 1}`,
            baseUrl: readText(item.baseUrl, 2000),
            apiFormat: normalizeApiFormat(item.apiFormat),
            models,
            apiKey: "",
            apiKeyConfigured: Boolean(item.apiKeyConfigured),
            assignedUserId: readText(item.assignedUserId, 64) || undefined,
        }];
    });
    return { ...input, channels };
}

function readText(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.slice(0, maxLength) : "";
}

async function encrypt(value: string, secret: string) {
    const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
    const result = new Uint8Array(iv.length + cipher.length);
    result.set(iv);
    result.set(cipher, iv.length);
    return btoa(String.fromCharCode(...result));
}

async function decrypt(value: string, secret: string) {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
}
