import { create } from "zustand";

import { loadAccount, rechargeCredits, subscribeMembership, updateProfile, type AccountProfile, type AccountSnapshot, type CreditRecord, type Membership, type MembershipPlan } from "@/services/api/account";
import { supabaseEnabled } from "@/services/supabase";
import { supabase } from "@/services/supabase";

type AccountStore = {
    profile: AccountProfile;
    credits: number;
    membership: Membership;
    records: CreditRecord[];
    plans: MembershipPlan[];
    loading: boolean;
    loaded: boolean;
    load: () => Promise<void>;
    recharge: (planId: string) => Promise<void>;
    subscribe: (planId: string) => Promise<void>;
    saveProfile: (patch: Pick<AccountProfile, "name" | "email">) => Promise<void>;
    reset: () => void;
};

const initialProfile: AccountProfile = { id: "local", name: "蝶讯用户", email: "", avatarUrl: "" };
const initialMembership: Membership = { planId: "free", planName: "普通用户", expiresAt: "" };

function applySnapshot(snapshot: AccountSnapshot) {
    return {
        profile: snapshot.profile,
        credits: snapshot.credits,
        membership: snapshot.membership,
        records: snapshot.records,
        plans: snapshot.plans,
    };
}

export const useAccountStore = create<AccountStore>()((set, get) => ({
    profile: initialProfile,
    credits: 0,
    membership: initialMembership,
    records: [],
    plans: [],
    loading: false,
    loaded: false,
    load: async () => {
        if (get().loading) return;
        set({ loading: true });
        try {
            if (!supabaseEnabled) throw new Error("Supabase 尚未配置，账号数据不会保存到本机");
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { set({ loaded: true }); return; }
            set({ ...applySnapshot(await loadAccount()), loaded: true });
        } finally {
            set({ loading: false });
        }
    },
    recharge: async (planId) => {
        const snapshot = await rechargeCredits(planId);
        set(applySnapshot(snapshot));
    },
    subscribe: async (planId) => {
        const snapshot = await subscribeMembership(planId);
        set(applySnapshot(snapshot));
    },
    saveProfile: async (patch) => {
        const snapshot = await updateProfile(patch);
        set(applySnapshot(snapshot));
    },
    reset: () => set({ profile: initialProfile, credits: 0, membership: initialMembership, records: [], plans: [], loaded: false }),
}));
