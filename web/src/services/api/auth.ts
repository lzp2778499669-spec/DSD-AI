import PocketBase, { BaseAuthStore } from "pocketbase";

import { AUTH_API_URL } from "@/constant/runtime-config";

export type AccessStatus = "pending" | "approved" | "disabled";

export type AuthUser = {
    id: string;
    username: string;
    email: string;
    accessStatus: AccessStatus;
};

const SESSION_STORE_KEY = "infinite-canvas:auth-session";
const PERSISTENT_STORE_KEY = "infinite-canvas:auth-persistent";
const REMEMBER_SESSION_KEY = "infinite-canvas:remember-session";
let useSessionStore = typeof window !== "undefined" && sessionStorage.getItem(REMEMBER_SESSION_KEY) === "1";

class RememberableAuthStore extends BaseAuthStore {
    constructor() {
        super();
        const serialized = sessionStorage.getItem(SESSION_STORE_KEY) || localStorage.getItem(PERSISTENT_STORE_KEY);
        if (!serialized) return;
        try {
            const state = JSON.parse(serialized) as { token?: string; record?: Record<string, unknown> };
            super.save(state.token || "", state.record as unknown as import("pocketbase").AuthRecord);
            useSessionStore = sessionStorage.getItem(REMEMBER_SESSION_KEY) === "1";
        } catch {
            sessionStorage.removeItem(SESSION_STORE_KEY);
            localStorage.removeItem(PERSISTENT_STORE_KEY);
        }
    }

    save(token: string, record?: import("pocketbase").AuthRecord) {
        super.save(token, record);
        const serialized = JSON.stringify({ token, record });
        if (useSessionStore) {
            sessionStorage.setItem(SESSION_STORE_KEY, serialized);
            localStorage.removeItem(PERSISTENT_STORE_KEY);
        } else {
            localStorage.setItem(PERSISTENT_STORE_KEY, serialized);
            sessionStorage.removeItem(SESSION_STORE_KEY);
        }
    }

    clear() {
        super.clear();
        sessionStorage.removeItem(SESSION_STORE_KEY);
        sessionStorage.removeItem(REMEMBER_SESSION_KEY);
        localStorage.removeItem(PERSISTENT_STORE_KEY);
    }
}

const client = new PocketBase(AUTH_API_URL, new RememberableAuthStore());
client.autoCancellation(false);

function normalizedUser(record: Record<string, unknown>): AuthUser {
    return {
        id: String(record.id || ""),
        username: String(record.username || ""),
        email: String(record.email || ""),
        accessStatus: record.accessStatus === "approved" || record.accessStatus === "disabled" ? record.accessStatus : "pending",
    };
}

export async function registerUser(username: string, password: string) {
    const normalizedUsername = username.trim();
    const email = `user-${crypto.randomUUID()}@users.local`;
    const record = await client.collection("users").create({
        username: normalizedUsername,
        email,
        password,
        passwordConfirm: password,
        accessStatus: "pending",
    });
    return normalizedUser(record as unknown as Record<string, unknown>);
}

export async function loginUser(username: string, password: string) {
    const auth = await client.collection("users").authWithPassword(username.trim(), password);
    return normalizedUser(auth.record as unknown as Record<string, unknown>);
}

export async function refreshCurrentUser() {
    if (!client.authStore.isValid) return null;
    try {
        const auth = await client.collection("users").authRefresh();
        return normalizedUser(auth.record as unknown as Record<string, unknown>);
    } catch {
        client.authStore.clear();
        return null;
    }
}

export function setRememberSession(remember: boolean) {
    useSessionStore = !remember;
    if (remember) {
        sessionStorage.removeItem("infinite-canvas:remember-session");
        sessionStorage.removeItem(SESSION_STORE_KEY);
    } else {
        sessionStorage.setItem(REMEMBER_SESSION_KEY, "1");
        localStorage.removeItem(PERSISTENT_STORE_KEY);
    }
}

export function currentUser() {
    const record = client.authStore.record;
    return client.authStore.isValid && record ? normalizedUser(record as unknown as Record<string, unknown>) : null;
}

export function onAuthChange(callback: (user: AuthUser | null) => void) {
    return client.authStore.onChange((_token, record) => callback(record ? normalizedUser(record as unknown as Record<string, unknown>) : null));
}

export function logoutUser() {
    client.authStore.clear();
}

export function hasAuthSession() {
    return client.authStore.isValid;
}

export function getAuthToken() {
    return client.authStore.token;
}
