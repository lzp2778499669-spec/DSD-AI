import { App, AutoComplete, Button, Drawer, Empty, Form, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { TableProps } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, ImagePlus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { CanvasNodeCropDialog, type CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import { cropDataUrl } from "@/lib/canvas/canvas-image-data";
import {
    clearPromptCategory,
    createManagedPrompt,
    deleteManagedPrompt,
    deletePromptCover,
    fetchManagedPrompts,
    removePromptTag,
    updateManagedPrompt,
    uploadPromptCover,
    type ManagedPromptInput,
    type Prompt,
} from "@/services/api/prompts";

export function PromptManagerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<ManagedPromptInput>();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<Prompt[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState("");
    const [coverUrl, setCoverUrl] = useState("");
    const [originalCoverUrl, setOriginalCoverUrl] = useState("");
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState("");
    const [cropSource, setCropSource] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems(await fetchManagedPrompts());
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("prompts.manager.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [message, t]);

    useEffect(() => {
        if (open) void load();
    }, [open, load]);

    const invalidatePrompts = () =>
        Promise.all([
            queryClient.invalidateQueries({ queryKey: ["prompts"] }),
            queryClient.invalidateQueries({ queryKey: ["side-panel-prompts"] }),
        ]);

    const categories = Array.from(new Set(items.map((item) => item.category).filter(Boolean)));
    const tags = Array.from(new Set(items.flatMap((item) => item.tags).filter(Boolean)));
    const categoryCounts = items.reduce<Record<string, number>>((counts, item) => {
        if (item.category) counts[item.category] = (counts[item.category] || 0) + 1;
        return counts;
    }, {});
    const tagCounts = items.reduce<Record<string, number>>((counts, item) => {
        item.tags.forEach((tag) => {
            counts[tag] = (counts[tag] || 0) + 1;
        });
        return counts;
    }, {});

    const resetCover = () => {
        if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
        setCoverUrl("");
        setCoverFile(null);
        setCoverPreview("");
        setCropSource("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const openCreate = () => {
        resetCover();
        setOriginalCoverUrl("");
        setEditingId("");
        form.resetFields();
        setEditorOpen(true);
    };

    const openEdit = (item: Prompt) => {
        if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
        setEditingId(item.id);
        form.setFieldsValue({
            title: item.title,
            prompt: item.prompt,
            description: item.description,
            category: item.category,
            tags: item.tags,
        });
        setCoverUrl(item.coverUrl);
        setOriginalCoverUrl(item.coverUrl);
        setCoverFile(null);
        setCoverPreview(item.coverUrl);
        setEditorOpen(true);
    };

    const closeEditor = () => {
        if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
        setEditorOpen(false);
        setEditingId("");
        setCoverFile(null);
        setCoverPreview("");
        setCoverUrl("");
        setOriginalCoverUrl("");
        setCropSource("");
        form.resetFields();
    };

    const closeDrawer = () => {
        closeEditor();
        onClose();
    };

    const selectCover = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            message.warning(t("prompts.manager.form.invalidImage"));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            message.warning(t("prompts.manager.form.imageTooLarge"));
            return;
        }
        try {
            setCropSource(await readFileAsDataUrl(file));
        } catch {
            message.error(t("prompts.manager.form.invalidImage"));
        }
    };

    const confirmCrop = async (crop: CanvasImageCropRect) => {
        if (!cropSource) return;
        try {
            const file = await createCoverFile(await cropDataUrl(cropSource, crop));
            if (file.size > 5 * 1024 * 1024) {
                message.warning(t("prompts.manager.form.imageTooLarge"));
                return;
            }
            if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
            setCoverFile(file);
            setCoverPreview(URL.createObjectURL(file));
            setCropSource("");
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("prompts.manager.form.cropFailed"));
        }
    };

    const removeCover = () => {
        if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
        setCoverUrl("");
        setCoverFile(null);
        setCoverPreview("");
    };

    const save = async () => {
        let values: ManagedPromptInput;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        setSaving(true);
        try {
            const nextCover = coverFile ? await uploadPromptCover(coverFile) : coverUrl;
            const input: ManagedPromptInput = { ...values, coverUrl: nextCover };
            if (editingId) {
                await updateManagedPrompt(editingId, input);
                if (originalCoverUrl && originalCoverUrl !== nextCover) void deletePromptCover(originalCoverUrl);
            } else {
                await createManagedPrompt(input);
            }
            await Promise.all([load(), invalidatePrompts()]);
            message.success(t(editingId ? "prompts.manager.saved" : "prompts.manager.created"));
            closeEditor();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("prompts.manager.saveFailed"));
        } finally {
            setSaving(false);
        }
    };

    const removePrompt = (item: Prompt) => {
        modal.confirm({
            title: t("prompts.manager.deleteTitle", { title: item.title }),
            content: t("prompts.manager.deleteDescription"),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                try {
                    await deleteManagedPrompt(item.id);
                    if (item.coverUrl) void deletePromptCover(item.coverUrl);
                    await Promise.all([load(), invalidatePrompts()]);
                    message.success(t("prompts.manager.deleted"));
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("prompts.manager.deleteFailed"));
                }
            },
        });
    };

    const removeCategory = (name: string) => {
        modal.confirm({
            title: t("prompts.manager.deleteCategoryTitle", { name }),
            content: t("prompts.manager.deleteCategoryDescription"),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                try {
                    await clearPromptCategory(name);
                    await Promise.all([load(), invalidatePrompts()]);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("prompts.manager.deleteFailed"));
                }
            },
        });
    };

    const removeTag = (name: string) => {
        modal.confirm({
            title: t("prompts.manager.deleteTagTitle", { name }),
            content: t("prompts.manager.deleteTagDescription"),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                try {
                    await removePromptTag(name);
                    await Promise.all([load(), invalidatePrompts()]);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("prompts.manager.deleteFailed"));
                }
            },
        });
    };

    const columns: TableProps<Prompt>["columns"] = [
        {
            title: t("prompts.manager.columns.cover"),
            dataIndex: "coverUrl",
            width: 72,
            render: (value: string) => value
                ? <img src={value} alt="" className="size-11 rounded-lg object-cover" />
                : <div className="grid size-11 place-items-center rounded-lg bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500"><FileText className="size-4" /></div>,
        },
        { title: t("prompts.manager.columns.title"), dataIndex: "title", ellipsis: true },
        { title: t("prompts.manager.columns.category"), dataIndex: "category", width: 130, render: (value: string) => value || "-" },
        {
            title: t("prompts.manager.columns.tags"),
            dataIndex: "tags",
            width: 220,
            render: (value: string[]) => value.length ? <div className="flex flex-wrap gap-1">{value.map((tag) => <Tag key={tag} className="m-0">{tag}</Tag>)}</div> : "-",
        },
        {
            title: t("prompts.manager.columns.actions"),
            width: 150,
            render: (_: unknown, item: Prompt) => (
                <div className="flex gap-1">
                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEdit(item)}>{t("prompts.manager.edit")}</Button>
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => removePrompt(item)} />
                </div>
            ),
        },
    ];

    return (
        <Drawer open={open} onClose={closeDrawer} width={1020} title={t("prompts.manager.title")} styles={{ body: { paddingTop: 16 } }}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-stone-500">{t("prompts.manager.description")}</div>
                <Space>
                    <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>{t("prompts.manager.refresh")}</Button>
                    <Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={openCreate}>{t("prompts.manager.add")}</Button>
                </Space>
            </div>

            <div className="mb-4 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{t("prompts.manager.vocabularyTitle")}</div>
                    <div className="text-xs text-stone-500">{t("prompts.manager.vocabularyDescription")}</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <Vocabulary label={t("prompts.manager.categories")} values={categories} counts={categoryCounts} empty={t("prompts.manager.noCategories")} onRemove={removeCategory} />
                    <Vocabulary label={t("prompts.manager.tags")} values={tags} counts={tagCounts} empty={t("prompts.manager.noTags")} onRemove={removeTag} />
                </div>
            </div>

            <Table
                rowKey="id"
                size="small"
                loading={loading}
                dataSource={items}
                columns={columns}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? t("prompts.manager.loading") : t("prompts.manager.empty")} /> }}
            />

            <Modal
                open={editorOpen}
                title={t(editingId ? "prompts.manager.form.editTitle" : "prompts.manager.form.addTitle")}
                okText={t("common.save")}
                cancelText={t("common.cancel")}
                confirmLoading={saving}
                onOk={() => void save()}
                onCancel={closeEditor}
                width={640}
            >
                <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
                    <Form.Item name="title" label={t("prompts.manager.form.title")} rules={[{ required: true, whitespace: true, message: t("prompts.manager.form.required") }, { max: 200 }]}>
                        <Input placeholder={t("prompts.manager.form.titlePlaceholder")} />
                    </Form.Item>
                    <Form.Item name="prompt" label={t("prompts.manager.form.prompt")} rules={[{ required: true, whitespace: true, message: t("prompts.manager.form.required") }, { max: 20000 }]}>
                        <Input.TextArea rows={5} placeholder={t("prompts.manager.form.promptPlaceholder")} />
                    </Form.Item>
                    <Form.Item name="description" label={t("prompts.manager.form.description")}>
                        <Input placeholder={t("prompts.manager.form.descriptionPlaceholder")} />
                    </Form.Item>
                    <Form.Item name="category" label={t("prompts.manager.form.category")}>
                        <AutoComplete options={categories.map((value) => ({ value }))} placeholder={t("prompts.manager.form.categoryPlaceholder")} allowClear />
                    </Form.Item>
                    <Form.Item name="tags" label={t("prompts.manager.form.tags")}>
                        <Select mode="tags" tokenSeparators={[",", "，"]} options={tags.map((value) => ({ value, label: value }))} placeholder={t("prompts.manager.form.tagsPlaceholder")} />
                    </Form.Item>
                    <div className="mb-4">
                        <div className="mb-1.5 text-sm font-medium">{t("prompts.manager.form.cover")}</div>
                        <div className="flex items-center gap-3">
                            {coverPreview ? <img src={coverPreview} alt="" className="h-20 w-28 rounded-lg object-cover" /> : <div className="grid h-20 w-28 place-items-center rounded-lg bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500"><FileText className="size-6" /></div>}
                            <div className="flex flex-col gap-2">
                                <Button icon={<ImagePlus className="size-4" />} onClick={() => fileInputRef.current?.click()}>{t("prompts.manager.form.chooseCover")}</Button>
                                {coverPreview ? <Button size="small" type="text" danger onClick={removeCover}>{t("prompts.manager.form.removeCover")}</Button> : null}
                            </div>
                        </div>
                        <div className="mt-1.5 text-xs text-stone-400">{t("prompts.manager.form.coverHint")}</div>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={selectCover} />
                    </div>
                </Form>
            </Modal>

            <CanvasNodeCropDialog dataUrl={cropSource} open={Boolean(cropSource)} initialRatioPreset="4:3" zIndex={1200} onClose={() => setCropSource("")} onConfirm={(crop) => void confirmCrop(crop)} />
        </Drawer>
    );
}

function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function createCoverFile(dataUrl: string) {
    const image = await loadImageElement(dataUrl);
    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9))
        || await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("cover encode failed");
    const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/png" ? "png" : "webp";
    return new File([blob], `cover.${extension}`, { type: blob.type || "image/webp" });
}

function loadImageElement(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image load failed"));
        image.src = src;
    });
}

function Vocabulary({ label, values, counts, empty, onRemove }: { label: string; values: string[]; counts: Record<string, number>; empty: string; onRemove: (value: string) => void }) {
    return (
        <div>
            <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">{label}</span>
                <span className="text-[11px] text-stone-400">{values.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {values.length ? values.map((value) => (
                    <Tag key={value} closable onClose={(event) => { event.preventDefault(); onRemove(value); }} className="m-0">
                        {value} · {counts[value] || 0}
                    </Tag>
                )) : <span className="text-xs text-stone-400">{empty}</span>}
            </div>
        </div>
    );
}
