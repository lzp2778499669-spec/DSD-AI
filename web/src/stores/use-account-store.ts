import { create } from "zustand";

import { loadAccount, rechargeCredits, subscribeMembership, updateProfile, type AccountProfile, type AccountSnapshot, type CreditRecord, type Membership, type MembershipPlan } from "@/services/api/account";

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
            set({ ...applySnapshot(await loadAccount()), loaded: true });
        } finally {
            set({ loading: false });
        }
    },
    recharge: async (planId) => set(applySnapshot(await rechargeCredits(planId))),
    subscribe: async (planId) => set(applySnapshot(await subscribeMembership(planId))),
    saveProfile: async (patch) => set(applySnapshot(await updateProfile(patch))),
    reset: () => set({ profile: initialProfile, credits: 0, membership: initialMembership, records: [], plans: [], loaded: false }),
}));
