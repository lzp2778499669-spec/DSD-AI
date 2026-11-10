import { App, Button, Form, Input, Modal, Progress, Radio, Select, Switch, Tabs } from "antd";
import type { TFunction } from "i18next";
import { Cloud, Pencil, Plus, RefreshCw, Trash2, Upload, Download, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { videoResolutionOptions } from "@/components/video-settings-panel";
import { ChannelEditorDrawer } from "@/components/layout/channel-editor-drawer";
import { ConfigLocalProxy } from "@/components/layout/config-local-proxy";
import { ConfigLocalStorage } from "@/components/layout/config-local-storage";
import { ConfigGroups } from "@/components/layout/config-groups";
import { ConfigUserReview } from "@/components/layout/config-user-review";
import { checkIsAdmin } from "@/services/api/admin";
import type { AppLocale } from "@/i18n";
import { exportAppConfig, importAppConfig } from "@/services/config-file";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaScaleOptions, parseVideoResolution } from "@/lib/media-size";
import { createModelChannel, useConfigStore, withChannels, type AiConfig, type ApiCallFormat, type ConfigTabKey, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { useGroupStore } from "@/stores/use-group-store";
import { syncAppDataToWebdav, type AppSyncDomainKey, type AppSyncProgressEvent } from "@/services/app-sync";
import { testWebdavConnection, WEBDAV_MANIFEST_FILE_NAME } from "@/services/webdav-sync";

type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "videoModel" | "textModel";
    labelKey: string;
};

type WebdavDomainProgress = { stage: string; current?: number; total?: number; status?: "active" | "success" | "exception" };
const webdavDomainKeys: AppSyncDomainKey[] = ["canvas", "assets", "image-workbench", "video-workbench"];
function createWebdavDomainProgress(): Record<AppSyncDomainKey, WebdavDomainProgress> { return Object.fromEntries(webdavDomainKeys.map((key) => [key, { stage: "等待同步" }])) as Record<AppSyncDomainKey, WebdavDomainProgress>; }

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", labelKey: "config.preferences.defaultImageModel" },
    { capability: "video", modelKey: "videoModel", labelKey: "config.preferences.defaultVideoModel" },
    { capability: "text", modelKey: "textModel", labelKey: "config.preferences.defaultTextModel" },
];

export function AppConfigPanel({ showDoneButton = false, initialTab = "channels" }: { showDoneButton?: boolean; initialTab?: ConfigTabKey }) {
    const { message } = App.useApp();
    const { i18n, t } = useTranslation();
    const configInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<ConfigTabKey>(initialTab);
    const [isAdmin, setIsAdmin] = useState(false);
    const [editingChannelId, setEditingChannelId] = useState("");
    const [testingWebdav, setTestingWebdav] = useState(false);
    const [syncingWebdav, setSyncingWebdav] = useState(false);
    const [webdavSyncStatus, setWebdavSyncStatus] = useState("");
    const [webdavDomainProgress, setWebdavDomainProgress] = useState(createWebdavDomainProgress);
    const config = useConfigStore((state) => state.config);
    const webdav = useConfigStore((state) => state.webdav);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const updateWebdavConfig = useConfigStore((state) => state.updateWebdavConfig);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const groupConfig = useGroupStore((state) => state.config);
    const groups = useGroupStore((state) => state.groups);
    const activeGroupId = useGroupStore((state) => state.activeGroupId);
    const activeGroup = groups.find((group) => group.id === activeGroupId);
    const groupConfigActive = Boolean(activeGroup && groupConfig?.channels.length);
    const editingChannel = config.channels.find((channel) => channel.id === editingChannelId) || null;
    const webdavReady = Boolean(webdav.url.trim());
    const locale = i18n.resolvedLanguage as AppLocale;
    const imageResolutionOptions = mediaScaleOptions.map((value) => ({ value, label: value === "auto" ? t("settingsPanels.common.auto") : value.toUpperCase() }));
    useEffect(() => setActiveTab(initialTab), [initialTab]);
    useEffect(() => {
        void checkIsAdmin().then(setIsAdmin).catch(() => setIsAdmin(false));
    }, []);

    const saveConfig = (nextConfig: AiConfig) => {
        (Object.keys(nextConfig) as Array<keyof AiConfig>).forEach((key) => updateConfig(key, nextConfig[key]));
    };

    const finishConfig = () => {
        const ready = [...(groupConfig?.channels || []), ...config.channels].some((channel) => channel.baseUrl.trim() && (channel.apiKeyConfigured || channel.apiKey.trim()) && channel.models.length);
        setConfigDialogOpen(false);
        if (!ready) return;
        message.success(t(shouldPromptContinue ? "config.savedContinue" : "config.saved"));
        clearPromptContinue();
    };

    const loadConfigFile = async (file: File) => {
        try {
            await importAppConfig(file);
            message.success(t("config.imported"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.importFailed"));
        } finally {
            if (configInputRef.current) configInputRef.current.value = "";
        }
    };

    const updateChannels = (channels: ModelChannel[]) => saveConfig(withChannels(config, channels));

    const addChannel = () => {
        const channel = createModelChannel({ name: t("config.channels.numberedName", { count: config.channels.length + 1 }) });
        updateChannels([...config.channels, channel]);
        setEditingChannelId(channel.id);
    };

    const deleteChannel = (id: string) => {
        if (config.channels.length <= 1) {
            message.warning(t("config.channels.keepOne"));
            return;
        }
        updateChannels(config.channels.filter((channel) => channel.id !== id));
    };

    const saveChannel = async (channel: ModelChannel) => {
        updateChannels(config.channels.map((item) => (item.id === channel.id ? { ...channel, apiKeyConfigured: Boolean(channel.apiKey.trim()) || item.apiKeyConfigured } : item)));
    };

    const testWebdav = async () => {
        setTestingWebdav(true);
        try { await testWebdavConnection(webdav); message.success(t("config.webdav.available")); }
        catch (error) { message.error(error instanceof Error ? error.message : t("config.webdav.testFailed")); }
        finally { setTestingWebdav(false); }
    };

    const updateWebdavProgress = (event: AppSyncProgressEvent) => {
        setWebdavSyncStatus(event.stage);
        if (!event.domain) return;
        setWebdavDomainProgress((current) => ({ ...current, [event.domain as AppSyncDomainKey]: { stage: event.stage, current: event.current, total: event.total, status: event.status } }));
    };

    const syncWebdav = async () => {
        setSyncingWebdav(true);
        setWebdavDomainProgress(createWebdavDomainProgress());
        try {
            const result = await syncAppDataToWebdav(webdav, updateWebdavProgress);
            updateWebdavConfig("lastSyncedAt", result.syncedAt);
            message.success(t("config.webdav.completed", { projects: result.projects, assets: result.assets, records: result.imageLogs + result.videoLogs, files: result.uploadedFiles, bytes: formatBytes(result.uploadedBytes) }));
        } catch (error) { setWebdavSyncStatus(error instanceof Error ? error.message : t("config.webdav.failed")); message.error(error instanceof Error ? error.message : t("config.webdav.failed")); }
        finally { setSyncingWebdav(false); }
    };

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3 dark:border-stone-800">
                <div className="text-xs text-stone-500">{t("config.fileSecurity")}</div>
                <div className="flex gap-2">
                    <Button icon={<Upload className="size-4" />} onClick={() => configInputRef.current?.click()}>
                        {t("config.import")}
                    </Button>
                    <Button icon={<Download className="size-4" />} onClick={exportAppConfig}>
                        {t("config.export")}
                    </Button>
                    <input ref={configInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => event.target.files?.[0] && void loadConfigFile(event.target.files[0])} />
                </div>
            </div>
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as ConfigTabKey)}
                items={[
                    {
                        key: "channels",
                        label: t("config.tabs.channels"),
                        children: (
                            <div>
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-xs text-stone-500">{t("config.channels.description")}</div>
                                    <Button type="primary" icon={<Plus className="size-4" />} onClick={addChannel}>
                                        {t("config.channels.add")}
                                    </Button>
                                </div>
                                {groupConfigActive ? (
                                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                                        <span>当前使用「{activeGroup?.name}」的组共享 API 配置，个人渠道仅在组未配置时生效。</span>
                                        {activeGroup?.role === "owner" ? <Button size="small" onClick={() => setActiveTab("groups")}>管理组配置</Button> : null}
                                    </div>
                                ) : null}
                                <div className="space-y-2">
                                    {config.channels.map((channel) => (
                                        <div key={channel.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold">{channel.name || t("config.channels.unnamed")}</div>
                                                <div className="mt-1 truncate text-xs text-stone-500">
                                                    {apiFormatLabel(channel.apiFormat)} · {t("config.channels.modelCount", { count: channel.models.length })} · {channel.baseUrl || t("config.channels.missingUrl")}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 gap-2">
                                                <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => setEditingChannelId(channel.id)}>
                                                    {t("common.edit")}
                                                </Button>
                                                <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => deleteChannel(channel.id)} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: "groups",
                        label: t("config.tabs.groups"),
                        children: <ConfigGroups />,
                    },
                    ...(isAdmin ? [{ key: "user-review" as const, label: t("config.tabs.userReview"), children: <ConfigUserReview active={activeTab === "user-review"} /> }] : []),
                    {
                        key: "local-proxy",
                        label: t("config.tabs.localProxy"),
                        children: <ConfigLocalProxy />,
                    },
                    {
                        key: "preferences",
                        label: t("config.tabs.preferences"),
                        children: (
                            <Form layout="vertical" requiredMark={false}>
                                <div className="mb-2 text-sm font-semibold">{t("config.preferences.defaultModels")}</div>
                                <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                    {modelGroups.map((group) => (
                                        <Form.Item key={group.modelKey} label={t(group.labelKey)} className="mb-0">
                                            <ModelPicker config={config} value={config[group.modelKey]} onChange={(model) => updateConfig(group.modelKey, model)} capability={group.capability} fullWidth />
                                        </Form.Item>
                                    ))}
                                </div>
                                <div className="mb-2 text-sm font-semibold">{t("config.preferences.generation")}</div>
                                <div className="grid gap-4 md:grid-cols-3">
                                    <Form.Item label={t("config.preferences.canvasImageCount")} extra={t("config.preferences.canvasImageCountDescription")} className="mb-4">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={15}
                                            value={config.canvasImageCount}
                                            onChange={(event) => updateConfig("canvasImageCount", event.target.value)}
                                            onBlur={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))}
                                        />
                                    </Form.Item>
                                    <Form.Item label={t("config.preferences.imageResolution")} className="mb-4">
                                        <Select value={inferMediaScale(config.size)} options={imageResolutionOptions} onChange={(scale) => updateConfig("size", computeMediaSize(scale, inferMediaRatio(config.size)))} />
                                    </Form.Item>
                                    <Form.Item label={t("config.preferences.videoResolution")} className="mb-4">
                                        <Select value={parseVideoResolution(config.vquality)} options={videoResolutionOptions} onChange={(value) => updateConfig("vquality", value)} />
                                    </Form.Item>
                                </div>
                                <Form.Item label={t("config.preferences.regenerateBehavior")} className="mb-4">
                                    <Radio.Group value={config.nodeRegenerateBehavior} onChange={(event) => updateConfig("nodeRegenerateBehavior", event.target.value)} className="flex flex-col gap-2">
                                        <Radio value="overwrite">
                                            <span className="block text-sm font-medium">{t("config.preferences.regenerateBehaviorOverwrite")}</span>
                                            <span className="mt-0.5 block text-xs opacity-60">{t("config.preferences.regenerateBehaviorOverwriteDescription")}</span>
                                        </Radio>
                                        <Radio value="new-node">
                                            <span className="block text-sm font-medium">{t("config.preferences.regenerateBehaviorNewNode")}</span>
                                            <span className="mt-0.5 block text-xs opacity-60">{t("config.preferences.regenerateBehaviorNewNodeDescription")}</span>
                                        </Radio>
                                    </Radio.Group>
                                </Form.Item>
                                <Form.Item className="mb-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm">{t("config.preferences.autoFocusOnSelect")}</span>
                                        <Switch checked={config.autoFocusOnSelect} onChange={(checked) => updateConfig("autoFocusOnSelect", checked)} />
                                    </div>
                                </Form.Item>
                                <Form.Item label={t("config.preferences.systemPrompt")} className="mb-0">
                                    <Input.TextArea rows={4} value={config.systemPrompt} placeholder={t("config.preferences.systemPromptPlaceholder")} onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                                </Form.Item>
                            </Form>
                        ),
                    },
                    {
                        key: "webdav",
                        label: "WebDAV",
                        children: <WebdavSettings webdav={webdav} webdavReady={webdavReady} testing={testingWebdav} syncing={syncingWebdav} status={webdavSyncStatus} progress={webdavDomainProgress} onChange={updateWebdavConfig} onTest={() => void testWebdav()} onSync={() => void syncWebdav()} t={t} locale={i18n.resolvedLanguage as AppLocale} />,
                    },
                    { key: "local-storage", label: t("config.tabs.localStorage"), children: <ConfigLocalStorage active={activeTab === "local-storage"} /> },
                ]}
            />
            {showDoneButton ? (
                <div className="mt-4 flex justify-end">
                    <Button type="primary" onClick={finishConfig}>
                        {t("common.done")}
                    </Button>
                </div>
            ) : null}
            <ChannelEditorDrawer open={Boolean(editingChannel)} channel={editingChannel} onSave={saveChannel} onClose={() => setEditingChannelId("")} />
        </>
    );
}

function WebdavSettings({ webdav, webdavReady, testing, syncing, status, progress, onChange, onTest, onSync, t, locale }: { webdav: import("@/stores/use-config-store").WebdavSyncConfig; webdavReady: boolean; testing: boolean; syncing: boolean; status: string; progress: Record<AppSyncDomainKey, WebdavDomainProgress>; onChange: <K extends keyof import("@/stores/use-config-store").WebdavSyncConfig>(key: K, value: import("@/stores/use-config-store").WebdavSyncConfig[K]) => void; onTest: () => void; onSync: () => void; t: TFunction; locale: AppLocale }) {
    return <Form layout="vertical" requiredMark={false}><div className="mb-3 text-sm font-semibold">{t("config.webdav.title")}</div><p className="mb-4 text-xs text-stone-500">{t("config.webdav.description")}</p><div className="grid gap-4 md:grid-cols-2">
        <Form.Item label={t("config.webdav.url")}><Input value={webdav.url} onChange={(event) => onChange("url", event.target.value)} /></Form.Item>
        <Form.Item label={t("config.webdav.directory")} extra={t("config.webdav.directoryDescription", { manifest: WEBDAV_MANIFEST_FILE_NAME })}><Input value={webdav.directory} onChange={(event) => onChange("directory", event.target.value)} /></Form.Item>
        <Form.Item label={t("config.webdav.username")}><Input value={webdav.username} onChange={(event) => onChange("username", event.target.value)} /></Form.Item>
        <Form.Item label={t("config.webdav.password")}><Input.Password value={webdav.password} onChange={(event) => onChange("password", event.target.value)} /></Form.Item>
    </div><div className="flex flex-wrap items-center gap-2"><Button icon={<Wifi className="size-4" />} loading={testing} onClick={onTest}>{t("config.webdav.test")}</Button><Button type="primary" icon={<RefreshCw className="size-4" />} disabled={!webdavReady || testing} loading={syncing} onClick={onSync}>{t(syncing ? "config.webdav.syncing" : "config.webdav.syncNow")}</Button><span className="text-xs text-stone-500">{webdav.lastSyncedAt ? new Date(webdav.lastSyncedAt).toLocaleString(locale) : status}</span></div>{syncing || status ? <div className="mt-3 grid gap-2">{webdavDomainKeys.map((key) => <div key={key} className="flex items-center justify-between gap-3 text-xs"><span>{t(`config.webdav.domains.${key === "image-workbench" ? "imageWorkbench" : key === "video-workbench" ? "videoWorkbench" : key}`)}</span><Progress className="max-w-44" percent={progress[key].status === "success" ? 100 : progress[key].current && progress[key].total ? Math.round((progress[key].current! / progress[key].total!) * 100) : 0} size="small" showInfo={false} /></div>)}</div> : null}</Form>;
}

export function AppConfigModal() {
    const { t } = useTranslation();
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const configTab = useConfigStore((state) => state.configTab);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">{t("config.title")}</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">{t("config.modalDescription")}</div>
                </div>
            }
            open={isConfigOpen}
            width={980}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 12 } }}
            footer={null}
        >
            <AppConfigPanel showDoneButton initialTab={configTab} />
        </Modal>
    );
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 3))));
}

function apiFormatLabel(apiFormat: ApiCallFormat) {
    if (apiFormat === "openai-chat") return "OpenAI Chat";
    if (apiFormat === "gemini") return "Gemini";
    return "OpenAI";
}

