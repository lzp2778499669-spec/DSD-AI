import { createClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/constant/runtime-config";

export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const supabase = createClient(SUPABASE_URL || "https://missing-project.supabase.co", SUPABASE_ANON_KEY || "missing-supabase-anon-key", {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type CloudDomain = "account" | "canvas" | "assets" | "config" | "image-workbench" | "video-workbench";

const boundUsers = new Map<CloudDomain, string>();

export function bindCloudDomain(domain: CloudDomain, userId: string) {
    boundUsers.set(domain, userId);
}

export function unbindCloudDomains() {
    boundUsers.clear();
}

export async function loadCloudDomain<T>(domain: CloudDomain, fallback: T): Promise<T> {
    if (!supabaseEnabled) throw new Error("Supabase 尚未配置，无法读取云端数据");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("请先登录后读取云端数据");
    boundUsers.set(domain, user.id);
    const { data, error } = await supabase.from("user_state").select("payload").eq("user_id", user.id).eq("domain", domain).maybeSingle();
    if (error) throw error;
    return (data?.payload as T | undefined) ?? fallback;
}

export async function saveCloudDomain(domain: CloudDomain, payload: unknown) {
    if (!supabaseEnabled) throw new Error("Supabase 尚未配置，无法保存云端数据");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("请先登录后保存云端数据");
    if (boundUsers.get(domain) !== user.id) return;
    const { error } = await supabase.from("user_state").upsert({ user_id: user.id, domain, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id,domain" });
    if (error) throw error;
}


export async function uploadPrivateFile(path: string, blob: Blob) {
    if (!supabaseEnabled) throw new Error("Supabase 尚未配置，文件不会保存到本机");
    const { error } = await supabase.storage.from("user-data").upload(path, blob, { upsert: true, contentType: blob.type || "application/octet-stream" });
    if (error) throw error;
    return path;
}

export async function downloadPrivateFile(path: string) {
    const { data, error } = await supabase.storage.from("user-data").download(path);
    if (error) throw error;
    return data;
}

export async function invokeCloudAi(action: string, payload: unknown, options?: { signal?: AbortSignal }) {
    if (!supabaseEnabled) throw new Error("Supabase AI 代理尚未配置");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("请先登录");
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-proxy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
        signal: options?.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Supabase AI 代理不可用（HTTP ${response.status}）`);
    return result;
}

export async function removePrivateFiles(paths: string[]) {
    if (!paths.length) return;
    const { error } = await supabase.storage.from("user-data").remove(paths);
    if (error) throw error;
}

export async function saveChannelSecret(channelId: string, apiKey: string) {
    if (!supabaseEnabled) throw new Error("Supabase 尚未配置");
    const { error } = await supabase.functions.invoke("channel-secrets", { body: { action: "save", channelId, apiKey } });
    if (error) throw error;
}

export async function deleteChannelSecret(channelId: string) {
    if (!supabaseEnabled) throw new Error("Supabase 尚未配置");
    const { error } = await supabase.functions.invoke("channel-secrets", { body: { action: "delete", channelId } });
    if (error) throw error;
}

export async function channelSecretConfigured(channelId: string) {
    const { data, error } = await supabase.functions.invoke("channel-secrets", { body: { action: "status", channelId } });
    if (error) throw error;
    return Boolean(data?.configured);
}

export async function loadMyChannelSecrets(channelIds: string[]) {
    const { data, error } = await supabase.functions.invoke("channel-secrets", { body: { action: "load-many", channelIds } });
    if (error) throw error;
    return (data?.secrets || {}) as Record<string, string>;
}

export async function listChannelSecretStatuses(channelIds: string[]) {
    const statuses = await Promise.all(channelIds.map(async (channelId) => [channelId, await channelSecretConfigured(channelId)] as const));
    return Object.fromEntries(statuses) as Record<string, boolean>;
}
