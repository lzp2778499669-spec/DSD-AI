import { supabase } from "@/services/supabase";

export type PendingProfile = {
    id: string;
    username: string;
    created_at: string;
};

export async function checkIsAdmin() {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) return false;
    return Boolean(data);
}

export async function listPendingProfiles(): Promise<PendingProfile[]> {
    const { data, error } = await supabase.rpc("list_pending_profiles");
    if (error) throw error;
    return (data || []) as PendingProfile[];
}

export async function reviewProfile(id: string, status: "approved" | "disabled") {
    const { error } = await supabase.rpc("review_profile", { target_id: id, next_status: status === "approved" ? "已通过" : "未通过" });
    if (error) throw error;
}
