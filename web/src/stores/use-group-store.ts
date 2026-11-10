import { create } from "zustand";

import type { AiConfig } from "@/stores/use-config-store";
import { loadGroupConfig, loadMyGroups, saveGroupConfig, type GroupRecord } from "@/services/api/groups";

const ACTIVE_GROUP_KEY = "infinite-canvas:active_group";

type GroupStore = {
    groups: GroupRecord[];
    activeGroupId: string;
    config: AiConfig | null;
    loading: boolean;
    initialized: boolean;
    refresh: () => Promise<void>;
    setActiveGroup: (groupId: string) => Promise<void>;
    loadConfig: (groupId?: string) => Promise<AiConfig | null>;
    saveConfig: (config: AiConfig) => Promise<AiConfig | null>;
    clear: () => void;
};

function readActiveGroupId() {
    try {
        return localStorage.getItem(ACTIVE_GROUP_KEY) || "";
    } catch {
        return "";
    }
}

function writeActiveGroupId(groupId: string) {
    try {
        if (groupId) localStorage.setItem(ACTIVE_GROUP_KEY, groupId);
        else localStorage.removeItem(ACTIVE_GROUP_KEY);
    } catch {
        // 本地存储不可用时仅影响“上次选中的组”，不影响组功能本身。
    }
}

let refreshTask: Promise<void> | null = null;
let stateGeneration = 0;

export const useGroupStore = create<GroupStore>((set, get) => ({
    groups: [],
    activeGroupId: readActiveGroupId(),
    config: null,
    loading: false,
    initialized: false,
    refresh: async () => {
        if (refreshTask) return refreshTask;
        const currentGeneration = stateGeneration;
        set({ loading: true });
        const task = (async () => {
            try {
                const groups = await loadMyGroups();
                if (currentGeneration !== stateGeneration) return;
                const storedId = get().activeGroupId;
                const activeGroupId = groups.some((group) => group.id === storedId) ? storedId : groups[0]?.id || "";
                writeActiveGroupId(activeGroupId);
                set({ groups, activeGroupId });
                const activeGroup = groups.find((group) => group.id === activeGroupId);
                if (activeGroupId && activeGroup?.access_status === "已通过") await get().loadConfig(activeGroupId);
                else set({ config: null });
            } finally {
                if (refreshTask === task) refreshTask = null;
                if (currentGeneration === stateGeneration) set({ loading: false, initialized: true });
            }
        })();
        refreshTask = task;
        return task;
    },
    setActiveGroup: async (groupId) => {
        if (groupId === get().activeGroupId && get().config) return;
        writeActiveGroupId(groupId);
        set({ activeGroupId: groupId, config: null });
        if (!groupId) return;
        const target = get().groups.find((group) => group.id === groupId);
        if (target?.access_status !== "已通过") return;
        await get().loadConfig(groupId);
    },
    loadConfig: async (groupId) => {
        const targetGroupId = groupId || get().activeGroupId;
        if (!targetGroupId) return null;
        const currentGeneration = stateGeneration;
        const config = await loadGroupConfig(targetGroupId);
        if (currentGeneration !== stateGeneration) return null;
        if (get().activeGroupId === targetGroupId) set({ config });
        return config;
    },
    saveConfig: async (config) => {
        const groupId = get().activeGroupId;
        if (!groupId) throw new Error("请先选择一个组");
        const currentGeneration = stateGeneration;
        const saved = await saveGroupConfig(groupId, config);
        if (currentGeneration === stateGeneration) set({ config: saved });
        return saved;
    },
    clear: () => {
        stateGeneration += 1;
        refreshTask = null;
        writeActiveGroupId("");
        set({ groups: [], activeGroupId: "", config: null, loading: false, initialized: false });
    },
}));
