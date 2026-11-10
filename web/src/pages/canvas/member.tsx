import { App, Button, Empty, Spin, Tag } from "antd";
import { ArrowLeft, Download, Eye, Maximize2 } from "lucide-react";
import { saveAs } from "file-saver";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ConnectionPath } from "@/components/canvas/canvas-connections";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { canvasThemes } from "@/lib/canvas-theme";
import { resolveMemberMediaUrl } from "@/services/file-storage";
import { loadMemberCanvasProjects, loadMemberName } from "@/services/api/groups";
import { resolveMemberImageUrl } from "@/services/image-storage";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";

export default function MemberCanvasPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { userId = "" } = useParams();
    const [name, setName] = useState("组成员");
    const [projects, setProjects] = useState<CanvasProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [reloadKey, setReloadKey] = useState(0);
    const [opening, setOpening] = useState(false);
    const [opened, setOpened] = useState<CanvasProject | null>(null);
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [preview, setPreview] = useState("");
    const themeName = useThemeStore((state) => state.theme);
    const theme = canvasThemes[themeName];

    useEffect(() => {
        let active = true;
        setLoading(true);
        void Promise.all([loadMemberName(userId), loadMemberCanvasProjects(userId)])
            .then(([memberName, list]) => {
                if (!active) return;
                setName(memberName);
                setProjects(list);
            })
            .catch((error) => { if (active) message.error(error instanceof Error ? error.message : "读取成员画布失败"); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [userId, message, reloadKey]);

    useEffect(() => {
        if (!opened) return;
        const nodes = opened.nodes;
        if (!nodes.length) return;
        // 容器尺寸在首次布局后可能仍为 0，用窗口尺寸兜底，确保内容一定被居中显示。
        const frame = requestAnimationFrame(() => {
            const width = container?.clientWidth || window.innerWidth;
            const height = container?.clientHeight || Math.max(1, window.innerHeight - 48);
            const minX = Math.min(...nodes.map((node) => node.position.x));
            const minY = Math.min(...nodes.map((node) => node.position.y));
            const maxX = Math.max(...nodes.map((node) => node.position.x + node.width));
            const maxY = Math.max(...nodes.map((node) => node.position.y + node.height));
            const contentWidth = Math.max(1, maxX - minX);
            const contentHeight = Math.max(1, maxY - minY);
            const padding = 80;
            const scale = Math.min((width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight, 1);
            setViewport({ k: scale, x: (width - contentWidth * scale) / 2 - minX * scale, y: (height - contentHeight * scale) / 2 - minY * scale });
        });
        return () => cancelAnimationFrame(frame);
    }, [opened, container]);

    const openProject = async (project: CanvasProject) => {
        setOpening(true);
        try {
            const snapshot = structuredClone(project);
            await Promise.all(snapshot.nodes.map(async (node) => {
                const metadata = node.metadata;
                if (!metadata) return;
                if (metadata.storageKey && !metadata.storageKey.startsWith("image:")) {
                    metadata.content = await resolveMemberMediaUrl(userId, metadata.storageKey, metadata.content);
                }
                if (metadata.storageKey?.startsWith("image:")) {
                    metadata.content = await resolveMemberImageUrl(userId, metadata.storageKey, metadata.content);
                }
                if (metadata.images?.length) {
                    metadata.images = await Promise.all(metadata.images.map(async (image) => (image.storageKey ? { ...image, content: await resolveMemberImageUrl(userId, image.storageKey, image.content) } : image)));
                }
            }));
            setOpened(snapshot);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取画布失败");
        } finally {
            setOpening(false);
        }
    };

    const refreshOpened = async () => {
        if (!opened) return;
        setOpening(true);
        try {
            const list = await loadMemberCanvasProjects(userId);
            setProjects(list);
            const project = list.find((item) => item.id === opened.id);
            if (project) await openProject(project);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "同步画布失败");
        } finally {
            setOpening(false);
        }
    };

    const downloadImage = (node: CanvasNodeData) => {
        const content = node.metadata?.content;
        if (!content) { message.warning("该图片没有可下载内容"); return; }
        saveAs(content, `canvas-image-${node.id}.png`);
    };

    const header = (
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4" style={{ borderColor: theme.toolbar.border }}>
            <Button type="text" icon={<ArrowLeft className="size-4" />} onClick={() => (opened ? setOpened(null) : navigate("/config?tab=groups"))}>{opened ? "返回画布列表" : "返回组"}</Button>
            <div className="min-w-0 flex-1 truncate text-sm font-medium">{opened ? opened.title : `${name} 的画布`}</div>
            <Button size="small" onClick={() => (opened ? void refreshOpened() : setReloadKey((value) => value + 1))}>刷新</Button>
            <Tag className="!m-0">只读</Tag>
        </header>
    );

    if (opened) {
        const nodeById = new Map(opened.nodes.map((node) => [node.id, node]));
        return <main className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            {header}
            <div className="relative min-h-0 flex-1">
                {opening ? <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center"><Spin /></div> : null}
                <div ref={setContainer} className="absolute inset-0"><InfiniteCanvas containerRef={{ current: container }} viewport={viewport} tool="pan" backgroundMode={opened.backgroundMode || "lines"} onViewportChange={setViewport}>
                <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                    {opened.connections.map((connection) => {
                        const from = nodeById.get(connection.fromNodeId);
                        const to = nodeById.get(connection.toNodeId);
                        if (!from || !to) return null;
                        return <ConnectionPath key={connection.id} connection={connection} from={from} to={to} active={false} onSelect={() => undefined} />;
                    })}
                </svg>
                {opened.nodes.map((node) => {
                    const style = { position: "absolute" as const, left: node.position.x, top: node.position.y, width: node.width, height: node.height };
                    return <div key={node.id} data-node-id={node.id} style={style} className="overflow-hidden rounded-md border" onClick={() => node.type === "image" && node.metadata?.content && setPreview(node.metadata.content)}>
                        {node.type === "image" && node.metadata?.content ? <img src={node.metadata.content} alt={node.title} draggable={false} className="size-full cursor-zoom-in object-contain" /> : node.type === "video" && node.metadata?.content ? <video src={node.metadata.content} controls className="size-full object-contain" /> : node.type === "text" ? <div className="size-full overflow-hidden whitespace-pre-wrap p-2 text-sm" style={{ color: theme.node.text }}>{node.metadata?.content || ""}</div> : <div className="flex size-full items-center justify-center text-sm" style={{ background: theme.toolbar.panel, color: theme.node.text }}>{node.title}</div>}
                        {node.type === "image" && node.metadata?.content ? <div className="absolute bottom-2 right-2 flex gap-2">
                            <Button className="!h-10 !w-10" icon={<Maximize2 className="size-5" />} aria-label="放大查看" onClick={(event) => { event.stopPropagation(); setPreview(node.metadata?.content || ""); }} />
                            <Button className="!h-10 !w-10" icon={<Download className="size-5" />} aria-label="下载图片" onClick={(event) => { event.stopPropagation(); downloadImage(node); }} />
                        </div> : null}
                    </div>;
                })}
            </InfiniteCanvas></div>
            </div>
            <PreviewModal preview={preview} onClose={() => setPreview("")} />
        </main>;
    }

    return <main className="h-full overflow-y-auto bg-background">
        {header}
        <div className="mx-auto max-w-6xl px-6 py-6">
            <Spin spinning={loading}>
                {projects.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {projects.map((project) => (
                            <button key={project.id} type="button" onClick={() => void openProject(project)} className="rounded-xl border border-stone-200 p-4 text-left transition hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600">
                                <div className="truncate text-sm font-semibold">{project.title}</div>
                                <div className="mt-2 text-xs text-stone-500">{project.nodes.length} 个节点 · {project.connections.length} 条连线</div>
                                <div className="mt-4 flex items-center justify-between gap-2 text-xs text-stone-500">
                                    <span>更新于 {new Date(project.updatedAt).toLocaleString()}</span>
                                    <span className="inline-flex items-center gap-1"><Eye className="size-3.5" />只读查看</span>
                                </div>
                            </button>
                        ))}
                    </div>
                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "正在读取" : "该成员还没有画布"} />}
            </Spin>
        </div>
    </main>;
}

function PreviewModal({ preview, onClose }: { preview: string; onClose: () => void }) {
    if (!preview) return null;
    return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
        <img src={preview} alt="画布图片" className="max-h-full max-w-full object-contain" />
    </div>;
}
