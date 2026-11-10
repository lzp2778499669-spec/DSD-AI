import type { PersistStorage, StorageValue } from "zustand/middleware";

import { bindCloudDomain, loadCloudDomain, saveCloudDomain, supabase } from "@/services/supabase";
import type { CloudDomain } from "@/services/supabase";
import { loadMyChannelSecrets } from "@/services/supabase";

export function createCloudPersistStorage<T>(domain: CloudDomain): PersistStorage<T> {
    return {
        getItem: async (name) => {
            let state = domain === "config" ? await loadCloudConfig<StorageValue<T>["state"] | null>() : await loadCloudDomain<StorageValue<T>["state"] | null>(domain, null);
            if (domain === "config") {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("请先登录后读取云端配置");
                bindCloudDomain(domain, user.id);
                if (state && typeof state === "object" && "config" in state) {
                    const cloudState = state as { config: { channels?: Array<{ id: string; apiKey?: string }> } };
                    const secrets = await loadMyChannelSecrets((cloudState.config.channels || []).map((channel) => channel.id));
                    state = { ...state, config: { ...cloudState.config, channels: (cloudState.config.channels || []).map((channel) => ({ ...channel, apiKey: secrets[channel.id] || "", apiKeyConfigured: Boolean(secrets[channel.id]) })) } } as StorageValue<T>["state"];
                }
            }
            return state ? { state, version: 0 } : null;
        },
        setItem: (_name, value) => (domain === "config" ? saveCloudConfig(value.state) : saveCloudDomain(domain, value.state)),
        removeItem: async () => saveCloudDomain(domain, null),
    };
}

async function saveCloudConfig(value: unknown) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("请先登录后保存云端配置");
    const { error } = await supabase.rpc("save_my_config", { config_payload: value });
    if (error) throw error;
}

async function loadCloudConfig<T>() {
    const { data, error } = await supabase.rpc("get_my_config");
    if (error) throw error;
    return data as T | null;
}
