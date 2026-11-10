import { invokeCloudAi } from "@/services/supabase";

export async function invokeAiProxy(channelId: string, action: string, payload: unknown, options?: { signal?: AbortSignal }) {
    return invokeCloudAi(action, { channelId, ...payload as Record<string, unknown> }, options);
}
