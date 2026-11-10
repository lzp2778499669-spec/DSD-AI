import { App, Button, Empty, Modal, Select, Spin, Tag } from "antd";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ChannelEditorDrawer } from "@/components/layout/channel-editor-drawer";
import { ModelPicker } from "@/components/model-picker";
import { loadGroupMembers, saveGroupConfig, type GroupMembership } from "@/services/api/groups";
import { createModelChannel, decodeChannelModel, useConfigStore, withChannels, type AiConfig, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { useGroupStore } from "@/stores/use-group-store";

const modelFields: Array<{ capability: ModelCapability; key: "imageModel" | "videoModel" | "textModel"; label: string }> = [
    { capability: "image", key: "imageModel", label: "默认图片模型" },
    { capability: "video", key: "videoModel", label: "默认视频模型" },
    { capability: "text", key: "textModel", label: "默认文本模型" },
];

// 默认模型保存的是「渠道ID::模型名」，只读展示时还原成可读名称。
function modelLabel(config: AiConfig, key: "imageModel" | "videoModel" | "textModel") {
    const value = config[key];
    const decoded = decodeChannelModel(value);
    if (!decoded) return value || "未设置";
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel?.name ? `${decoded.model}（${channel.name}）` : decoded.model;
}

function groupTemplate(config: AiConfig): AiConfig {
    // 从个人配置复制结构和模型列表，但不携带个人密钥，避免把个人 Key 静默复制到组。
    return {
        ...structuredClone(config),
        apiKey: "",
        channels: config.channels.map((channel) => ({ ...structuredClone(channel), apiKey: "", apiKeyConfigured: false })),
    };
}

export function GroupApiConfigModal({ open, groupId, groupName, onClose, readOnly = false }: { open: boolean; groupId: string; groupName: string; onClose: () => void; readOnly?: boolean }) {
    const { message, modal } = App.useApp();
    const personalConfig = useConfigStore((state) => state.config);
    const activeGroupId = useGroupStore((state) => state.activeGroupId);
    const activeConfig = useGroupStore((state) => state.config);
    const loadConfig = useGroupStore((state) => state.loadConfig);
    const saveActiveConfig = useGroupStore((state) => state.saveConfig);
    const [draft, setDraft] = useState<AiConfig | null>(null);
    const [members, setMembers] = useState<GroupMembership[]>([]);
    const [editingChannelId, setEditingChannelId] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !groupId) return;
        let active = true;
        setLoading(true);
        const pending = groupId === activeGroupId && activeConfig ? Promise.resolve(activeConfig) : loadConfig(groupId);
        void pending
            .then((config) => { if (active) setDraft(readOnly ? config : config?.channels.length ? config : groupTemplate(personalConfig)); })
            .catch((error) => { if (active) message.error(error instanceof Error ? error.message : "读取组配置失败"); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [activeConfig, activeGroupId, groupId, loadConfig, message, open, personalConfig, readOnly]);

    const config = draft;
    const editingChannel = config?.channels.find((channel) => channel.id === editingChannelId) || null;

    useEffect(() => {
        if (!open || readOnly || !groupId) return;
        let active = true;
        void loadGroupMembers(groupId).then((list) => { if (active) setMembers(list); }).catch(() => undefined);
        return () => { active = false; };
    }, [open, readOnly, groupId]);

    const updateChannels = (channels: ModelChannel[]) => setDraft((current) => (current ? withChannels(current, channels) : current));

    const assignChannel = (id: string, userId: string) => {
        if (!config) return;
        updateChannels(config.channels.map((channel) => (channel.id === id ? { ...channel, assignedUserId: userId || undefined } : channel)));
    };

    const copyPersonalChannels = () => {
        if (!personalConfig.channels.length) {
            message.warning("个人配置里还没有渠道");
            return;
        }
        const apply = () => {
            // 只复制渠道结构和模型，不复制个人 API Key。
            const channels = personalConfig.channels.map((channel) => ({ ...structuredClone(channel), apiKey: "", apiKeyConfigured: false }));
            setDraft((current) => (current ? withChannels(current, channels) : current));
            message.success("已复制个人渠道，请为每个渠道重新填写 API Key");
        };
        if (!config?.channels.length) {
            apply();
            return;
        }
        modal.confirm({
            title: "复制个人渠道",
            content: "将用个人配置的渠道和模型替换当前组配置，API Key 不会复制，需要重新填写。",
            okText: "替换",
            cancelText: "取消",
            onOk: apply,
        });
    };

    const addChannel = () => {
        if (!config) return;
        const channel = createModelChannel({ name: `渠道 ${config.channels.length + 1}` });
        updateChannels([...config.channels, channel]);
        setEditingChannelId(channel.id);
    };

    const deleteChannel = (id: string) => {
        if (!config || config.channels.length <= 1) {
            message.warning("组配置至少保留一个渠道");
            return;
        }
        updateChannels(config.channels.filter((channel) => channel.id !== id));
    };

    const saveChannel = (channel: ModelChannel) => {
        if (!config) return;
        updateChannels(config.channels.map((item) => (item.id === channel.id ? channel : item)));
    };

    const save = async () => {
        if (!config) return;
        setSaving(true);
        try {
            if (groupId === activeGroupId) await saveActiveConfig(config);
            else await saveGroupConfig(groupId, config);
            message.success("组共享 API 配置已保存");
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存组配置失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Modal
                open={open}
                width={980}
                centered
                title={<div><div className="text-lg font-semibold">组共享 API 配置</div><div className="mt-1 text-xs font-normal text-stone-500">{groupName} · {readOnly ? "成员只读查看，由组长维护" : "仅组长可编辑，成员使用该配置生成"}</div></div>}
                onCancel={onClose}
                footer={readOnly ? <div className="flex justify-end"><Button onClick={onClose}>关闭</Button></div> : <div className="flex justify-end gap-2"><Button onClick={onClose}>取消</Button><Button type="primary" loading={saving} disabled={!config} onClick={() => void save()}>保存</Button></div>}
                styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 12 } }}
            >
                <Spin spinning={loading}>
                    {config ? (
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-stone-500">渠道和模型默认对组内所有成员生效；右侧可把渠道指定给单个成员，指定后仅该成员可见。未填写 API Key 的渠道无法生成。</p>
                                {readOnly ? null : <div className="flex flex-wrap gap-2">
                                    <Button icon={<Copy className="size-4" />} onClick={copyPersonalChannels}>从个人配置复制</Button>
                                    <Button type="primary" icon={<Plus className="size-4" />} onClick={addChannel}>添加渠道</Button>
                                </div>}
                            </div>
                            <div className="space-y-2">
                                {config.channels.map((channel) => (
                                    <div key={channel.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold">{channel.name || "未命名渠道"}</div>
                                            <div className="mt-1 truncate text-xs text-stone-500">{channel.models.length} 个模型 · {channel.baseUrl || "未填写地址"}{channel.apiKeyConfigured ? " · 密钥已配置" : ""}</div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {readOnly ? (channel.assignedUserId ? <Tag className="!m-0">专属</Tag> : null) : <Select
                                                size="small"
                                                className="w-32"
                                                value={channel.assignedUserId || ""}
                                                onChange={(value) => assignChannel(channel.id, value)}
                                                options={[{ value: "", label: "全部成员" }, ...members.map((member) => ({ value: member.user_id, label: member.username || "成员" }))]}
                                            />}
                                            {readOnly ? null : <>
                                                <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => setEditingChannelId(channel.id)}>编辑</Button>
                                                <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => deleteChannel(channel.id)} />
                                            </>}
                                        </div>
                                    </div>
                                ))}
                                {!config.channels.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有渠道" /> : null}
                                {readOnly && !config.channels.length ? <p className="text-xs text-stone-500">组长还没有配置组共享 API 渠道。</p> : null}
                            </div>
                            <div>
                                <div className="mb-3 text-sm font-semibold">默认模型</div>
                                <div className="grid gap-4 md:grid-cols-3">
                                    {modelFields.map((field) => (
                                        <label key={field.key} className="block">
                                            <span className="mb-1 block text-xs text-stone-500">{field.label}</span>
                                            {readOnly ? <div className="rounded-md border border-stone-200 px-3 py-2 text-sm dark:border-stone-800">{modelLabel(config, field.key)}</div> : <ModelPicker config={config} value={config[field.key]} onChange={(value) => setDraft((current) => (current ? { ...current, [field.key]: value } : current))} capability={field.capability} fullWidth />}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : !loading ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={readOnly ? "组长还没有配置组共享 API" : "还没有配置"} /> : null}
                </Spin>
            </Modal>
            {readOnly ? null : <ChannelEditorDrawer open={Boolean(editingChannel)} channel={editingChannel} onSave={(channel) => { saveChannel(channel); }} onClose={() => setEditingChannelId("")} />}
        </>
    );
}
