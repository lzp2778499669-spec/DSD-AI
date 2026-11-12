import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { supabase, supabaseEnabled } from "@/services/supabase";

export type Prompt = {
    id: string;
    title: string;
    prompt: string;
    description: string;
    coverUrl: string;
    referenceImageUrls: string[];
    tags: string[];
    preview: string;
    createdAt: string;
    updatedAt: string;
    author?: string;
    sourceUrl?: string;
    imageMode?: string;
    imageModel?: string;
    imageSize?: string;
    imageCount?: number;
    sourceId: string;
    category: string;
    githubUrl: string;
};

export const ALL_PROMPTS_OPTION = "all";

export const MANAGED_PROMPT_SOURCE_ID = "managed";
export const PROMPT_COVER_BUCKET = "prompt-covers";

export type ManagedPromptInput = {
    title: string;
    prompt: string;
    description?: string;
    coverUrl?: string;
    category?: string;
    tags?: string[];
};

type ManagedPromptRow = {
    id: string;
    title: string;
    prompt: string;
    description: string;
    cover_url: string;
    category: string;
    tags: string[] | null;
    created_at: string;
    updated_at: string;
};

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
};

export async function fetchManagedPrompts(): Promise<Prompt[]> {
    if (!supabaseEnabled) return [];
    const { data, error } = await supabase
        .from("prompts")
        .select("id,title,prompt,description,cover_url,category,tags,created_at,updated_at")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data || []) as ManagedPromptRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        prompt: row.prompt,
        description: row.description,
        coverUrl: row.cover_url,
        referenceImageUrls: [],
        tags: row.tags || [],
        preview: "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sourceId: MANAGED_PROMPT_SOURCE_ID,
        category: row.category,
        githubUrl: "",
    }));
}

function promptInputPayload(input: ManagedPromptInput) {
    return {
        title: input.title.trim(),
        prompt: input.prompt.trim(),
        description: input.description?.trim() || "",
        cover_url: input.coverUrl?.trim() || "",
        category: input.category?.trim() || "",
        tags: input.tags || [],
    };
}

export async function createManagedPrompt(input: ManagedPromptInput) {
    if (!supabaseEnabled) throw new Error(i18n.t("prompts.manager.notConfigured"));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error(i18n.t("prompts.manager.loginRequired"));
    const { error } = await supabase.from("prompts").insert({ ...promptInputPayload(input), created_by: user.id });
    if (error) throw error;
}

export async function updateManagedPrompt(id: string, input: ManagedPromptInput) {
    if (!supabaseEnabled) throw new Error(i18n.t("prompts.manager.notConfigured"));
    const { error } = await supabase.from("prompts").update(promptInputPayload(input)).eq("id", id);
    if (error) throw error;
}

export async function deleteManagedPrompt(id: string) {
    if (!supabaseEnabled) throw new Error(i18n.t("prompts.manager.notConfigured"));
    const { error } = await supabase.from("prompts").delete().eq("id", id);
    if (error) throw error;
}

export async function uploadPromptCover(file: File) {
    if (!supabaseEnabled) throw new Error(i18n.t("prompts.manager.notConfigured"));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error(i18n.t("prompts.manager.loginRequired"));
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${nanoid()}.${extension}`;
    const { error } = await supabase.storage.from(PROMPT_COVER_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg" });
    if (error) throw error;
    return supabase.storage.from(PROMPT_COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function deletePromptCover(url: string) {
    const path = promptCoverPath(url);
    if (!path || !supabaseEnabled) return;
    await supabase.storage.from(PROMPT_COVER_BUCKET).remove([path]);
}

function promptCoverPath(url: string) {
    const marker = `/storage/v1/object/public/${PROMPT_COVER_BUCKET}/`;
    const index = url.indexOf(marker);
    return index >= 0 ? decodeURIComponent(url.slice(index + marker.length)) : "";
}

export async function clearPromptCategory(name: string) {
    const { error } = await supabase.rpc("clear_prompt_category", { category_name: name });
    if (error) throw error;
}

export async function removePromptTag(name: string) {
    const { error } = await supabase.rpc("remove_prompt_tag", { tag_name: name });
    if (error) throw error;
}

export async function fetchPrompts({ keyword = "", tag = [], category = ALL_PROMPTS_OPTION, page = 1, pageSize = 20 }: { keyword?: string; tag?: string[]; category?: string; page?: number; pageSize?: number } = {}) {
    const items = await fetchManagedPrompts();
    const normalizedKeyword = keyword.trim().toLowerCase();
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.max(1, Math.min(100, pageSize));
    const withoutTagFilter = filterPrompts(items, { keyword: normalizedKeyword, category, tags: [] });
    const filtered = filterPrompts(items, { keyword: normalizedKeyword, category, tags: tag });

    return {
        items: filtered.slice((normalizedPage - 1) * normalizedPageSize, normalizedPage * normalizedPageSize),
        tags: collectTags(withoutTagFilter),
        categories: [...new Set(items.map((item) => item.category.trim()).filter(Boolean))],
        total: filtered.length,
    };
}

function filterPrompts(items: Prompt[], options: { keyword: string; category: string; tags: string[] }) {
    return items.filter((item) => {
        if (isActiveOption(options.category) && ![item.title, item.prompt, item.description, item.category, ...item.tags].join(" ").includes(options.category)) return false;
        if (options.tags.length && !options.tags.some((tag) => item.tags.includes(tag))) return false;
        if (!options.keyword) return true;
        return [item.title, item.prompt, item.description, item.category, ...item.tags].join(" ").toLowerCase().includes(options.keyword);
    });
}

function collectTags(items: Prompt[]) {
    return [...new Set(items.flatMap((item) => item.tags).filter(Boolean))];
}

function isActiveOption(value: string) {
    return value && value !== ALL_PROMPTS_OPTION && value !== "all";
}

export function formatPromptDate(value: string, locale?: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
