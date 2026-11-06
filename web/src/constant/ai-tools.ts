import { Brush, Camera, Clapperboard, Eraser, Grid2x2, Images, Layers, PenLine, Shirt, Sparkles, ZoomIn, type LucideIcon } from "lucide-react";

import type { CanvasGenerationMode } from "@/types/canvas";

export type AiToolGroup = "generation" | "fashion" | "pattern" | "processing";

export type AiTool = {
    id: string;
    group: AiToolGroup;
    icon: LucideIcon;
    titleKey: string;
    descKey: string;
    mode: CanvasGenerationMode;
    // 插入画布时预填到生成节点的提示词，用户可以继续修改。
    prompt: string;
};

export const AI_TOOL_GROUPS: { id: AiToolGroup; titleKey: string }[] = [
    { id: "generation", titleKey: "tools.groups.generation" },
    { id: "fashion", titleKey: "tools.groups.fashion" },
    { id: "pattern", titleKey: "tools.groups.pattern" },
    { id: "processing", titleKey: "tools.groups.processing" },
];

export const AI_TOOLS: AiTool[] = [
    {
        id: "text-to-image",
        group: "generation",
        icon: Sparkles,
        titleKey: "tools.items.textToImage.title",
        descKey: "tools.items.textToImage.desc",
        mode: "image",
        prompt: "2026 春夏女装，宽松廓形风衣，米白色，双排扣，高级面料质感，棚拍，柔和侧光",
    },
    {
        id: "image-to-image",
        group: "generation",
        icon: Images,
        titleKey: "tools.items.imageToImage.title",
        descKey: "tools.items.imageToImage.desc",
        mode: "image",
        prompt: "参考已连接的图片，保持主体结构和风格，优化面料质感与光影，输出高清成片。",
    },
    {
        id: "line-drawing",
        group: "fashion",
        icon: PenLine,
        titleKey: "tools.items.lineDrawing.title",
        descKey: "tools.items.lineDrawing.desc",
        mode: "image",
        prompt: "服装设计线稿，正面与背面款式图，清晰结构线，黑白线稿，无背景，标注工艺细节。",
    },
    {
        id: "line-to-style",
        group: "fashion",
        icon: Shirt,
        titleKey: "tools.items.lineToStyle.title",
        descKey: "tools.items.lineToStyle.desc",
        mode: "image",
        prompt: "参考已连接的服装线稿，生成完整款式效果图，真实面料质感，棚拍光线，保持线稿结构。",
    },
    {
        id: "local-edit",
        group: "fashion",
        icon: Brush,
        titleKey: "tools.items.localEdit.title",
        descKey: "tools.items.localEdit.desc",
        mode: "image",
        prompt: "参考已连接的款式图，只修改指定局部（领口、袖型、下摆或口袋），其余结构、颜色和面料保持一致。",
    },
    {
        id: "fabric-fit",
        group: "fashion",
        icon: Layers,
        titleKey: "tools.items.fabricFit.title",
        descKey: "tools.items.fabricFit.desc",
        mode: "image",
        prompt: "参考已连接的款式图和面料图，把面料自然贴合到款式上，保持褶皱、垂坠和光影真实。",
    },
    {
        id: "pattern",
        group: "pattern",
        icon: Grid2x2,
        titleKey: "tools.items.pattern.title",
        descKey: "tools.items.pattern.desc",
        mode: "image",
        prompt: "四方连续印花图案，主题为花卉与几何结合，配色高级，矢量感，边缘可无缝拼接。",
    },
    {
        id: "commercial-photo",
        group: "pattern",
        icon: Camera,
        titleKey: "tools.items.commercialPhoto.title",
        descKey: "tools.items.commercialPhoto.desc",
        mode: "image",
        prompt: "服装商业摄影，模特全身，简洁高级棚拍背景，柔和侧光，真实皮肤质感，电商主图风格。",
    },
    {
        id: "image-to-video",
        group: "pattern",
        icon: Clapperboard,
        titleKey: "tools.items.imageToVideo.title",
        descKey: "tools.items.imageToVideo.desc",
        mode: "video",
        prompt: "参考已连接的图片，生成 5 秒平滑运镜短视频，主体自然微动，镜头缓慢推进，画面稳定。",
    },
    {
        id: "remove-background",
        group: "processing",
        icon: Eraser,
        titleKey: "tools.items.removeBackground.title",
        descKey: "tools.items.removeBackground.desc",
        mode: "image",
        prompt: "参考已连接的图片，精确抠出主体并去除背景，保留发丝和边缘细节，输出透明背景 PNG。",
    },
    {
        id: "upscale",
        group: "processing",
        icon: ZoomIn,
        titleKey: "tools.items.upscale.title",
        descKey: "tools.items.upscale.desc",
        mode: "image",
        prompt: "参考已连接的图片，无损放大到 4K，增强面料纹理和细节，保持原始构图和色彩。",
    },
];
