import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";

type AppConfigFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    config: AiConfig;
};

export function exportAppConfig() {
    const { config, webdav } = useConfigStore.getState();
    const safeConfig = { ...config, apiKey: "", channels: config.channels.map((channel) => ({ ...channel, apiKey: "", apiKeyConfigured: Boolean(channel.apiKeyConfigured) })) };
    const data: AppConfigFile = { app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), config: safeConfig, webdav };
    saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), "infinite-canvas-config.json");
}

export async function importAppConfig(file: File) {
    let data: AppConfigFile;
    try {
        data = JSON.parse(await file.text()) as AppConfigFile;
    } catch {
        throw new Error(i18n.t("config.invalidFile"));
    }
    if (data.app !== "infinite-canvas" || data.version !== 1 || !data.config || !data.webdav) throw new Error(i18n.t("config.invalidFile"));
    useConfigStore.setState({ config: { ...data.config, apiKey: "", channels: data.config.channels.map((channel) => ({ ...channel, apiKey: "", apiKeyConfigured: Boolean(channel.apiKeyConfigured) })) }, webdav: data.webdav });
}
