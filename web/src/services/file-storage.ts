import { nanoid } from "nanoid";

import { downloadPrivateFile, removePrivateFiles, uploadPrivateFile } from "@/services/supabase";
import { getCurrentUserId } from "@/services/api/auth";
import { withLocalProxy } from "@/stores/use-config-store";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

const objectUrls = new Map<string, string>();

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    const blob = typeof input === "string" ? await (await fetch(withLocalProxy(input))).blob() : input;
    const storageKey = `${prefix}:${nanoid()}`;
    await uploadPrivateFile(`${await getCurrentUserId()}/${storageKey}`, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = blob.type.startsWith("video/") ? await readVideoMeta(url) : {};
    return { url, storageKey, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta };
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await downloadPrivateFile(`${await getCurrentUserId()}/${storageKey}`).catch(() => null);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getMediaBlob(storageKey: string) {
    return downloadPrivateFile(`${await getCurrentUserId()}/${storageKey}`).catch(() => null);
}

// 组员只读浏览他人画布时，按对方用户目录读取视频等媒体文件。
const memberObjectUrls = new Map<string, string>();

export async function resolveMemberMediaUrl(userId: string, storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cacheKey = `${userId}/${storageKey}`;
    const cached = memberObjectUrls.get(cacheKey);
    if (cached) return cached;
    const blob = await downloadPrivateFile(cacheKey).catch(() => null);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    memberObjectUrls.set(cacheKey, url);
    return url;
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    await uploadPrivateFile(`${await getCurrentUserId()}/${storageKey}`, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await removePrivateFiles([`${await getCurrentUserId()}/${key}`]);
        }),
    );
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    void usedKeys;
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}
