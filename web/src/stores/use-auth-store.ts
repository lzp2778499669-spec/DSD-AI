import { create } from "zustand";

import { currentUser, loginUser, logoutUser, onAuthChange, refreshCurrentUser, registerUser, setRememberSession, type AuthUser } from "@/services/api/auth";

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
    user: currentUser(),
    initialized: false,
    busy: false,
    initialize: () => {
        let active = true;
        const unsubscribe = onAuthChange((user) => set({ user }));
        set({ user: currentUser(), initialized: false });
        void refreshCurrentUser().then((user) => {
            if (active) set({ user, initialized: true });
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
        } finally {
            set({ busy: false });
        }
    },
    register: async (username, password) => {
        set({ busy: true });
        try {
            const user = await registerUser(username, password);
            set({ user });
        } finally {
            set({ busy: false });
        }
    },
    logout: () => {
        logoutUser();
        set({ user: null });
    },
}));
