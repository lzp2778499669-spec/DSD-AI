import type { AccountSnapshot } from "@/services/api/account-types";
import { supabase, supabaseEnabled } from "@/services/supabase";

export type AccountProfile = AccountSnapshot["profile"];
export type CreditRecord = AccountSnapshot["records"][number];
export type MembershipPlan = AccountSnapshot["plans"][number];
export type Membership = AccountSnapshot["membership"];

function requireSupabase() {
    if (!supabaseEnabled) throw new Error("Supabase 尚未配置");
}

export async function loadAccount(): Promise<AccountSnapshot> {
    requireSupabase();
    const [{ data, error }, auth] = await Promise.all([supabase.rpc("get_my_account"), supabase.auth.getUser()]);
    if (error) throw error;
    if (!data) throw new Error("账号资料不存在");
    const snapshot = data as AccountSnapshot;
    return { ...snapshot, profile: { ...snapshot.profile, id: auth.data.user?.id || snapshot.profile.id, email: auth.data.user?.email || "" } };
}

export async function rechargeCredits(planId: string): Promise<AccountSnapshot> {
    void planId;
    throw new Error("积分充值尚未接入 Supabase 支付服务");
}

export async function subscribeMembership(planId: string): Promise<AccountSnapshot> {
    void planId;
    throw new Error("会员订阅尚未接入 Supabase 支付服务");
}

export async function updateProfile(patch: Pick<AccountProfile, "name" | "email">): Promise<AccountSnapshot> {
    void patch.email;
    const { error } = await supabase.rpc("update_my_profile", { profile_name: patch.name.trim(), profile_avatar: "" });
    if (error) throw error;
    return loadAccount();
}
