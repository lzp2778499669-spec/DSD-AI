import { useEffect, useState } from "react";
import { App, Button, Input, Modal } from "antd";
import { Coins, Crown, Mail, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { accountApiMode, type MembershipPlan } from "@/services/api/account";
import { brand } from "@/constant/brand";
import { useAccountStore } from "@/stores/use-account-store";

function PlanCard({ plan, action, loading, onAction }: { plan: MembershipPlan; action: string; loading: boolean; onAction: () => void }) {
    return (
        <div className="flex flex-col rounded-xl border border-stone-200 p-4 dark:border-stone-700">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-base font-semibold">{plan.name}</span>
                <span className="text-lg font-semibold text-red-500">¥{plan.price}</span>
            </div>
            <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                {plan.credits.toLocaleString()} 积分{plan.days > 0 ? ` · ${plan.days} 天` : " · 永久有效"}
            </div>
            <ul className="mt-3 flex-1 space-y-1.5 text-sm text-stone-600 dark:text-stone-300">
                {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-red-500" />
                        {feature}
                    </li>
                ))}
            </ul>
            <Button type="primary" className="mt-4" style={{ background: brand.accent, borderColor: brand.accent }} loading={loading} onClick={onAction}>
                {action}
            </Button>
        </div>
    );
}

export function CreditsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const credits = useAccountStore((state) => state.credits);
    const records = useAccountStore((state) => state.records);
    const plans = useAccountStore((state) => state.plans);
    const recharge = useAccountStore((state) => state.recharge);
    const [pendingId, setPendingId] = useState("");

    const rechargePlans = plans.filter((plan) => plan.days === 0);
    const visiblePlans = rechargePlans.length ? rechargePlans : plans;

    const handleRecharge = async (plan: MembershipPlan) => {
        setPendingId(plan.id);
        try {
            await recharge(plan.id);
            message.success(t("account.rechargeSuccess", { credits: plan.credits }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("account.actionFailed"));
        } finally {
            setPendingId("");
        }
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} width={640} centered title={t("account.creditsTitle")}>
            <div className="rounded-xl border border-stone-200 p-5 dark:border-stone-700">
                <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                    <Coins className="size-4" />
                    {t("account.currentCredits")}
                </div>
                <div className="mt-1 text-4xl font-semibold tracking-tight">{credits.toLocaleString()}</div>
                <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">{accountApiMode === "remote" ? t("account.remoteData") : t("account.localData")}</div>
            </div>

            <div className="mt-5 text-sm font-semibold">{t("account.recharge")}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
                {visiblePlans.map((plan) => (
                    <PlanCard key={plan.id} plan={plan} action={t("account.rechargeAction")} loading={pendingId === plan.id} onAction={() => void handleRecharge(plan)} />
                ))}
            </div>

            <div className="mt-5 text-sm font-semibold">{t("account.records")}</div>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {records.length ? (
                    records.map((record) => (
                        <div key={record.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-stone-50 dark:hover:bg-stone-800/60">
                            <div className="min-w-0">
                                <div className="truncate">{record.title}</div>
                                <div className="text-xs text-stone-400">{record.createdAt}</div>
                            </div>
                            <span className={record.amount >= 0 ? "shrink-0 font-medium text-emerald-500" : "shrink-0 font-medium text-red-500"}>
                                {record.amount >= 0 ? "+" : ""}
                                {record.amount.toLocaleString()}
                            </span>
                        </div>
                    ))
                ) : (
                    <div className="py-6 text-center text-sm text-stone-400">{t("account.noRecords")}</div>
                )}
            </div>
        </Modal>
    );
}

export function MembershipModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const membership = useAccountStore((state) => state.membership);
    const plans = useAccountStore((state) => state.plans);
    const subscribe = useAccountStore((state) => state.subscribe);
    const [pendingId, setPendingId] = useState("");

    const memberPlans = plans.filter((plan) => plan.days > 0);

    const handleSubscribe = async (plan: MembershipPlan) => {
        setPendingId(plan.id);
        try {
            await subscribe(plan.id);
            message.success(t("account.subscribeSuccess", { name: plan.name }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("account.actionFailed"));
        } finally {
            setPendingId("");
        }
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} width={720} centered title={t("account.membershipTitle")}>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50/60 p-5 dark:border-red-900/50 dark:bg-red-950/20">
                <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-full bg-red-500/10 text-red-500">
                        <Crown className="size-5" />
                    </span>
                    <div>
                        <div className="text-base font-semibold">{membership.planName}</div>
                        <div className="text-sm text-stone-500 dark:text-stone-400">{membership.expiresAt ? t("account.expiresAt", { date: membership.expiresAt }) : t("account.freePlan")}</div>
                    </div>
                </div>
                <div className="text-right text-sm text-stone-500 dark:text-stone-400">{t("account.memberBenefits")}</div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
                {memberPlans.map((plan) => (
                    <PlanCard key={plan.id} plan={plan} action={t("account.subscribeAction")} loading={pendingId === plan.id} onAction={() => void handleSubscribe(plan)} />
                ))}
            </div>
        </Modal>
    );
}

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const profile = useAccountStore((state) => state.profile);
    const saveProfile = useAccountStore((state) => state.saveProfile);
    const [name, setName] = useState(profile.name);
    const [email, setEmail] = useState(profile.email);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName(profile.name);
        setEmail(profile.email);
    }, [open, profile.email, profile.name]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveProfile({ name: name.trim() || t("account.defaultName"), email: email.trim() });
            message.success(t("account.profileSaved"));
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("account.actionFailed"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onCancel={onClose} onOk={() => void handleSave()} confirmLoading={saving} okText={t("common.save")} cancelText={t("common.cancel")} width={440} centered title={t("account.profileTitle")}>
            <div className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-full bg-stone-100 text-lg font-semibold dark:bg-stone-800">{profile.name.slice(0, 1)}</span>
                    <div className="text-sm text-stone-500 dark:text-stone-400">{t("account.avatarHint")}</div>
                </div>
                <label className="block space-y-1.5">
                    <span className="flex items-center gap-1.5 text-sm text-stone-500 dark:text-stone-400">
                        <UserRound className="size-3.5" />
                        {t("account.name")}
                    </span>
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("account.namePlaceholder")} />
                </label>
                <label className="block space-y-1.5">
                    <span className="flex items-center gap-1.5 text-sm text-stone-500 dark:text-stone-400">
                        <Mail className="size-3.5" />
                        {t("account.email")}
                    </span>
                    <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("account.emailPlaceholder")} />
                </label>
            </div>
        </Modal>
    );
}
