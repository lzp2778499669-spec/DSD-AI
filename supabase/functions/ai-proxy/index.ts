import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const allowedPaths: Record<string, string> = {
    "models.list": "/models",
    "image.generate": "/images/generations",
    "image.edit": "/images/edits",
    "text.generate": "/chat/completions",
};

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const secretKey = Deno.env.get("CHANNEL_SECRET_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !secretKey) return json({ error: "Supabase AI 代理尚未配置" }, 503);
    const authorization = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return json({ error: "请先登录" }, 401);

    const input = await request.json().catch(() => null) as { action?: string; payload?: { channelId?: string; config?: { model?: string; apiFormat?: string; baseUrl?: string; [key: string]: unknown }; prompt?: string; count?: number; references?: string[]; messages?: unknown[] } } | null;
    if (!input?.action || !input.payload || typeof input.payload.channelId !== "string") return json({ error: "请求参数无效" }, 400);
    if (input.payload.config?.apiFormat === "gemini" || input.action.startsWith("video.")) return json({ error: "该渠道协议尚未接入 Supabase AI 代理" }, 501);
    const path = allowedPaths[input.action];
    if (!path) return json({ error: "不支持的 AI 操作" }, 400);

    const service = createClient(supabaseUrl, serviceKey);
    const { data: secret, error: secretError } = await service.from("user_channel_secrets").select("encrypted_payload").eq("user_id", user.id).eq("channel_id", input.payload.channelId).maybeSingle();
    if (secretError) return json({ error: "读取渠道密钥失败" }, 500);
    if (!secret?.encrypted_payload) return json({ error: "请先将渠道 API Key 保存到 Supabase" }, 400);

    let apiKey = "";
    try { apiKey = await decrypt(String(secret.encrypted_payload), secretKey); }
    catch { return json({ error: "渠道密钥解密失败" }, 500); }

    const baseUrl = normalizeBaseUrl(String(input.payload.config?.baseUrl || ""));
    if (!baseUrl) return json({ error: "渠道接口地址无效" }, 400);
    const target = `${baseUrl}/v1${path}`.replace(/\/v1\/v1\//, "/v1/");
    try {
        const response = await fetch(target, {
            method: input.action === "models.list" ? "GET" : "POST",
            headers: { Authorization: `Bearer ${apiKey}`, ...(input.action === "image.edit" ? {} : { "Content-Type": "application/json" }) },
            ...(input.action === "models.list" ? {} : { body: JSON.stringify(buildPayload(input.action, input.payload)) }),
        });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok) return json({ error: await response.text().catch(() => "AI provider request failed") }, response.status);
        if (input.action === "models.list") {
            const data = await response.json();
            return json({ models: Array.isArray(data.data) ? data.data.map((item: { id?: string }) => item.id).filter(Boolean) : [] });
        }
        if (input.action === "image.generate") {
            const data = await response.json();
            const images = (data.data || []).map((item: { b64_json?: string; url?: string }, index: number) => ({ id: `image-${index}`, dataUrl: item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url }));
            return json({ images });
        }
        if (input.action === "text.generate") {
            const data = await response.json();
            return json({ text: data.choices?.[0]?.message?.content || "" });
        }
        return json({ error: `图片编辑响应格式暂未支持（${contentType}）` }, 501);
    } catch {
        return json({ error: "AI provider request failed" }, 502);
    }
});

function buildPayload(action: string, input: NonNullable<Parameters<typeof buildPayload>[1]>) {
    const config = input.config || {};
    if (action === "image.generate") return { model: config.imageModel || config.model, prompt: input.prompt, n: input.count || 1, size: config.size, quality: config.quality, output_format: "png" };
    if (action === "text.generate") return { model: config.textModel || config.model, messages: input.messages, stream: false };
    return {};
}

function normalizeBaseUrl(value: string) {
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return "";
        return `${url.origin}${url.pathname}`.replace(/\/+$/, "").replace(/\/v1$/i, "");
    } catch { return ""; }
}

async function decrypt(value: string, secret: string) {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
}

function json(value: unknown, status = 200) {
    return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...corsHeaders } });
}
