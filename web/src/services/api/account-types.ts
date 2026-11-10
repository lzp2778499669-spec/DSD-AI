export type AccountSnapshot = {
    profile: { id: string; name: string; email: string; avatarUrl: string };
    credits: number;
    membership: { planId: string; planName: string; expiresAt: string };
    records: Array<{ id: string; title: string; amount: number; createdAt: string }>;
    plans: Array<{ id: string; name: string; price: number; credits: number; days: number; features: string[] }>;
};
