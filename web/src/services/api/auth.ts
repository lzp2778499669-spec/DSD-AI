import { supabase, supabaseEnabled } from "@/services/supabase";

export type AccessStatus = "待审核" | "已通过" | "未通过";

export type AuthUser = {
    id: string;
    username: string;
    email: string;
    accessStatus: AccessStatus;
};

// Supabase Auth 只接受邮箱、手机号或第三方登录，没有用户名登录，因此用户名在提交前映射为固定域名的内部邮箱。
const USERNAME_EMAIL_DOMAIN = "users.infinite-canvas.local";
const USERNAME_PATTERN = /^[a-z0-9._-]{2,32}$/;

function requireSupabase() {
    if (!supabaseEnabled) throw new Error("Supabase 尚未配置，请填写项目 URL 和 publishable key");
}

function resolveAuthEmail(identifier: string) {
    const value = identifier.trim().toLowerCase();
    if (value.includes("@")) return value;
    if (!USERNAME_PATTERN.test(value)) throw new Error("账号只能包含字母、数字、点、下划线或短横线，长度 2 到 32 位");
    return `${value}@${USERNAME_EMAIL_DOMAIN}`;
}

function resolveDisplayName(identifier: string) {
    return identifier.trim().toLowerCase().split("@")[0];
}

async function loadAccessStatus(userId: string): Promise<AccessStatus> {
    const { data } = await supabase.from("profiles").select("access_status").eq("id", userId).maybeSingle();
    const status = data?.access_status;
    return status === "已通过" || status === "未通过" ? status : "待审核";
}

function toAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }, accessStatus: AccessStatus): AuthUser {
    return { id: user.id, email: user.email || "", username: String(user.user_metadata?.username || user.email?.split("@")[0] || ""), accessStatus };
}

async function loadAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
    return toAuthUser(user, await loadAccessStatus(user.id));
}

export async function registerUser(username: string, password: string) {
    requireSupabase();
    const email = resolveAuthEmail(username);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: resolveDisplayName(username) } } });
    if (error) {
        // 账号可能已创建成功但确认邮件发送失败，此时直接尝试用同一凭据登录，避免用户看到误导性的邮件错误。
        const { data: retry } = await supabase.auth.signInWithPassword({ email, password });
        if (retry.user) return loadAuthUser(retry.user);
        if (/already registered/i.test(error.message)) throw new Error("该账号已被注册，请直接登录");
        throw error;
    }
    if (!data.user) throw new Error("注册未完成");
    if (data.session) return loadAuthUser(data.user);
    const { data: login, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) throw new Error("账号已创建，但自动登录失败，请直接使用该账号登录");
    return loadAuthUser(login.user);
}

export async function loginUser(username: string, password: string) {
    requireSupabase();
    const email = resolveAuthEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return loadAuthUser(data.user);
}


export async function refreshCurrentUser() {
    if (!supabaseEnabled) return null;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return loadAuthUser(user);
}

export function setRememberSession(_remember: boolean) {}

export async function currentUser() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user ? loadAuthUser(data.session.user) : null;
}

export function onAuthChange(callback: (user: AuthUser | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
            callback(null);
            return;
        }
        void loadAuthUser(session.user).then(callback);
    });
    return () => data.subscription.unsubscribe();
}

export function logoutUser() {
    void supabase.auth.signOut();
}

export async function hasAuthSession() {
    if (!supabaseEnabled) return false;
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
}

export async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
}

export async function getCurrentUserId() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("请先登录");
    return user.id;
}
