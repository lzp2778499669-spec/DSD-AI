import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { AiConfig } from "@/stores/use-config-store";
import { supabase, supabaseEnabled } from "@/services/supabase";
import { getCurrentUserId } from "@/services/api/auth";

export type GroupRecord = { id: string; name: string; owner_id: string; role?: "owner" | "member"; access_status?: "待审核" | "已通过" | "未通过" };
export type GroupMembership = { id?: string; group_id: string; user_id: string; role?: "owner" | "member"; username?: string; created_at?: string };

function requireSupabase() {
    if (!supabaseEnabled) throw new Error("Supabase 尚未配置，请先设置项目 URL 和 publishable key");
}

async function currentUserId() {
    requireSupabase();
    return getCurrentUserId();
}

export async function loadMyGroups() {
    const userId = await currentUserId();
    const { data, error } = await supabase.from("group_members").select("role, groups(id,name,owner_id,access_status)").eq("user_id", userId);
    if (error) throw error;
    return (data || []).flatMap((membership) => membership.groups ? [{ ...(membership.groups as unknown as GroupRecord), role: membership.role as "owner" | "member" }] : []);
}

export async function createGroup(name: string, inviteCode: string) {
    await currentUserId();
    const { data, error } = await supabase.rpc("create_group", { group_name: name.trim(), invite_code: inviteCode.trim().toUpperCase() });
    if (error) throw error;
    return data as GroupRecord;
}

export async function deleteGroup(groupId: string) {
    await currentUserId();
    const { error } = await supabase.from("groups").delete().eq("id", groupId);
    if (error) throw error;
}

export async function searchGroups(name: string) {
    await currentUserId();
    const { data, error } = await supabase.rpc("search_groups", { group_query: name.trim() });
    if (error) throw error;
    return (data || []) as GroupRecord[];
}

export async function requestGroupMembership(groupId: string, inviteCode: string) {
    await currentUserId();
    const { data, error } = await supabase.rpc("apply_to_group", { target_group: groupId, invite_code: inviteCode.trim().toUpperCase() });
    if (error) throw error;
    return data;
}

export async function loadGroupMembers(groupId: string) {
    await currentUserId();
    const { data, error } = await supabase.from("group_members").select("group_id,user_id,role,created_at,profiles(username)").eq("group_id", groupId);
    if (error) throw error;
    return (data || []).map((item) => ({ ...item, username: (item.profiles as unknown as { username?: string } | null)?.username || "组成员" })) as GroupMembership[];
}

export async function loadGroupApplications(groupId: string) {
    await currentUserId();
    const { data, error } = await supabase.from("group_applications").select("id,group_id,user_id,created_at,profiles(username)").eq("group_id", groupId);
    if (error) throw error;
    return (data || []).map((item) => ({ ...item, username: (item.profiles as unknown as { username?: string } | null)?.username || "用户" })) as GroupMembership[];
}

export async function reviewGroupApplication(id: string, approve: boolean) {
    await currentUserId();
    const { error } = await supabase.rpc("review_group_application", { application_id: id, approve });
    if (error) throw error;
}

export async function removeGroupMember(groupId: string, userId: string) {
    await currentUserId();
    const { error } = await supabase.rpc("leave_group", { target_group: groupId, target_user: userId });
    if (error) throw error;
}

export async function loadGroupConfig(groupId: string): Promise<AiConfig | null> {
    requireSupabase();
    const { data, error } = await supabase.functions.invoke("channel-secrets", { body: { action: "group-load", groupId } });
    if (error) throw new Error(await readFunctionError(error, "读取组配置失败"));
    if (data?.error) throw new Error(String(data.error));
    return (data?.config as AiConfig | null) || null;
}

export async function saveGroupConfig(groupId: string, config: AiConfig): Promise<AiConfig | null> {
    requireSupabase();
    const { data, error } = await supabase.functions.invoke("channel-secrets", { body: { action: "group-save", groupId, config } });
    if (error) throw new Error(await readFunctionError(error, "保存组配置失败"));
    if (data?.error) throw new Error(String(data.error));
    return loadGroupConfig(groupId);
}

async function readFunctionError(error: unknown, fallback: string) {
    const response = (error as { context?: Response })?.context;
    if (response && typeof response.json === "function") {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        if (body?.error) return body.error;
    }
    return error instanceof Error ? error.message : fallback;
}

export async function loadMemberName(memberId: string) {
    const { data } = await supabase.from("profiles").select("username").eq("id", memberId).maybeSingle();
    return data?.username || "组成员";
}

export async function loadMemberCanvasProjects(memberId: string): Promise<CanvasProject[]> {
    await currentUserId();
    const { data, error } = await supabase.rpc("get_member_canvas_state", { member_id: memberId });
    if (error) throw error;
    const state = data as { projects?: CanvasProject[] } | null;
    return state?.projects || [];
}
