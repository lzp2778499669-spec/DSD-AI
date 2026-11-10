import { create } from "zustand";

import { currentUser, loginUser, logoutUser, onAuthChange, refreshCurrentUser, registerUser, setRememberSession, type AuthUser } from "@/services/api/auth";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useGroupStore } from "@/stores/use-group-store";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";
import { unbindCloudDomains } from "@/services/supabase";

type AuthStore = {
    user: AuthUser | null;
    initialized: boolean;
    busy: boolean;
    initialize: () => () => void;
    refresh: () => Promise<AuthUser | null>;
    login: (username: string, password: string, remember: boolean) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
    user: null,
    initialized: false,
    busy: false,
    initialize: () => {
        let active = true;
        const unsubscribe = onAuthChange((user) => {
            set({ user });
            if (user) {
                rehydrateUserStores();
                refreshGroups();
            } else {
                clearUserStores();
            }
        });
        set({ user: null, initialized: false });
        void currentUser().then((user) => user || refreshCurrentUser()).then((user) => {
            if (!active) return;
            set({ user, initialized: true });
            if (user) refreshGroups();
        });
        return () => {
            active = false;
            unsubscribe();
        };
    },
    refresh: async () => {
        const user = await refreshCurrentUser();
        set({ user });
        return user;
    },
    login: async (username, password, remember) => {
        set({ busy: true });
        try {
            setRememberSession(remember);
            const user = await loginUser(username, password);
            set({ user });
            rehydrateUserStores();
            refreshGroups();
        } finally {
            set({ busy: false });
        }
    },
    register: async (username, password) => {
        set({ busy: true });
        try {
            const user = await registerUser(username, password);
            set({ user });
            rehydrateUserStores();
            refreshGroups();
        } finally {
            set({ busy: false });
        }
    },
    logout: () => {
        logoutUser();
        clearUserStores();
        set({ user: null });
    },
}));

function clearUserStores() {
    unbindCloudDomains();
    useCanvasStore.setState({ projects: [], deletedProjects: [], hydrated: true });
    useAssetStore.setState({ assets: [], hydrated: true });
    usePromptSourceStore.setState({ sources: [], schedule: { intervalMinutes: 30, lastFetchedAt: "" } });
    useConfigStore.setState({ config: { ...useConfigStore.getState().config, apiKey: "", channels: [] } });
    useGroupStore.getState().clear();
}

function rehydrateUserStores() {
    void Promise.all([useCanvasStore.persist.rehydrate(), useAssetStore.persist.rehydrate(), usePromptSourceStore.persist.rehydrate(), useConfigStore.persist.rehydrate()]);
}

function refreshGroups() {
    void useGroupStore.getState().refresh().catch(() => {
        // 组信息加载失败不阻塞登录；用户进入组页面时会再次尝试并展示具体错误。
    });
}
