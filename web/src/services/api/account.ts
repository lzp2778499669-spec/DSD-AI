import localforage from "localforage";
import { getAuthToken } from "@/services/api/auth";

// 账户接口地址。
// 不配置时使用浏览器本地账户，所有按钮都能真实操作并保存；
// 配置 VITE_ACCOUNT_API_URL 后自动切换到线上接口，前端代码不用改。
// 线上接口约定（均返回 AccountSnapshot）：
//   GET   /account
//   POST  /account/credits/recharge       { planId }
//   POST  /account/membership/subscribe   { planId }
//   PATCH /account/profile                { name, email }
const RUNTIME_ACCOUNT_URL = (typeof window !== "undefined" && window.__RUNTIME_CONFIG__?.ACCOUNT_API_URL) || "";
const API_BASE = (RUNTIME_ACCOUNT_URL || import.meta.env.VITE_ACCOUNT_API_URL || "").replace(/\/+$/, "");

export const accountApiMode: "remote" | "local" = API_BASE ? "remote" : "local";

export type AccountProfile = {
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
};

export type CreditRecord = {
    id: string;
    title: string;
    amount: number;
    createdAt: string;
};

export type MembershipPlan = {
    id: string;
    name: string;
    price: number;
    credits: number;
    days: number;
    features: string[];
};

export type Membership = {
    planId: string;
    planName: string;
    expiresAt: string;
};

export type AccountSnapshot = {
    profile: AccountProfile;
    credits: number;
    membership: Membership;
    records: CreditRecord[];
    plans: MembershipPlan[];
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "account" });
const SNAPSHOT_KEY = "snapshot";

function nowText() {
    return new Date().toLocaleString("zh-CN", { hour12: false });
}

function localPlans(): MembershipPlan[] {
    return [
        { id: "credits-1000", name: "1000 积分", price: 19, credits: 1000, days: 0, features: ["立即到账", "永久有效"] },
        { id: "credits-5000", name: "5000 积分", price: 89, credits: 5000, days: 0, features: ["立即到账", "多送 500 积分"] },
        { id: "monthly", name: "月度会员", price: 39, credits: 3000, days: 30, features: ["每月 3000 积分", "高清放大", "优先生成"] },
        { id: "yearly", name: "年度会员", price: 299, credits: 40000, days: 365, features: ["每年 40000 积分", "高清放大", "优先生成", "专属客服"] },
    ];
}

function defaultSnapshot(): AccountSnapshot {
    return {
        profile: { id: "local", name: "蝶讯用户", email: "", avatarUrl: "" },
        credits: 1280,
        membership: { planId: "free", planName: "普通用户", expiresAt: "" },
        records: [
            { id: "welcome", title: "新用户赠送", amount: 1280, createdAt: nowText() },
        ],
        plans: localPlans(),
    };
}

async function readLocal(): Promise<AccountSnapshot> {
    const stored = await store.getItem<AccountSnapshot>(SNAPSHOT_KEY);
    return stored || defaultSnapshot();
}

async function writeLocal(snapshot: AccountSnapshot) {
    await store.setItem(SNAPSHOT_KEY, snapshot);
    return snapshot;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
    if (!response.ok) throw new Error(`账户接口请求失败（HTTP ${response.status}）`);
    return (await response.json()) as T;
}

export async function loadAccount(): Promise<AccountSnapshot> {
    return accountApiMode === "remote" ? request<AccountSnapshot>("/account") : readLocal();
}

export async function rechargeCredits(planId: string): Promise<AccountSnapshot> {
    if (accountApiMode === "remote") return request<AccountSnapshot>("/account/credits/recharge", { method: "POST", body: JSON.stringify({ planId }) });
    const snapshot = await readLocal();
    const plan = snapshot.plans.find((item) => item.id === planId);
    if (!plan) throw new Error("充值套餐不存在");
    return writeLocal({
        ...snapshot,
        credits: snapshot.credits + plan.credits,
        records: [{ id: `recharge-${Date.now()}`, title: `充值 ${plan.name}`, amount: plan.credits, createdAt: nowText() }, ...snapshot.records],
    });
}

export async function subscribeMembership(planId: string): Promise<AccountSnapshot> {
    if (accountApiMode === "remote") return request<AccountSnapshot>("/account/membership/subscribe", { method: "POST", body: JSON.stringify({ planId }) });
    const snapshot = await readLocal();
    const plan = snapshot.plans.find((item) => item.id === planId);
    if (!plan || plan.days <= 0) throw new Error("会员套餐不存在");
    const expiresAt = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000).toLocaleDateString("zh-CN");
    return writeLocal({
        ...snapshot,
        credits: snapshot.credits + plan.credits,
        membership: { planId: plan.id, planName: plan.name, expiresAt },
        records: [{ id: `membership-${Date.now()}`, title: `开通 ${plan.name}`, amount: plan.credits, createdAt: nowText() }, ...snapshot.records],
    });
}

export async function updateProfile(patch: Pick<AccountProfile, "name" | "email">): Promise<AccountSnapshot> {
    if (accountApiMode === "remote") return request<AccountSnapshot>("/account/profile", { method: "PATCH", body: JSON.stringify(patch) });
    const snapshot = await readLocal();
    return writeLocal({ ...snapshot, profile: { ...snapshot.profile, ...patch } });
}
