import { App, Button, Empty } from "antd";
import { Check, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { listPasswordResetRequests, reviewPasswordReset, type PasswordResetRequest } from "@/services/api/auth";
import { listPendingProfiles, reviewProfile, type PendingProfile } from "@/services/api/admin";

export function ConfigUserReview({ active }: { active: boolean }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [items, setItems] = useState<PendingProfile[]>([]);
    const [resetItems, setResetItems] = useState<PasswordResetRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [profiles, resets] = await Promise.allSettled([listPendingProfiles(), listPasswordResetRequests()]);
            if (profiles.status === "fulfilled") setItems(profiles.value);
            else throw profiles.reason;
            if (resets.status === "fulfilled") setResetItems(resets.value);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.userReview.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [message, t]);

    useEffect(() => {
        if (active) void load();
    }, [active, load]);

    const review = async (id: string, status: "approved" | "disabled") => {
        setBusyId(id);
        try {
            await reviewProfile(id, status);
            message.success(t(status === "approved" ? "config.userReview.approved" : "config.userReview.rejected"));
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.userReview.actionFailed"));
        } finally {
            setBusyId("");
        }
    };

    const reviewReset = async (id: string, approve: boolean) => {
        setBusyId(id);
        try {
            await reviewPasswordReset(id, approve);
            message.success(t(approve ? "config.userReview.passwordResetApproved" : "config.userReview.passwordResetRejected"));
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.userReview.actionFailed"));
        } finally {
            setBusyId("");
        }
    };

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-stone-500">{t("config.userReview.description")}</div>
                <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>
                    {t("config.userReview.refresh")}
                </Button>
            </div>
            {items.length ? (
                <div className="space-y-2">
                    {items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{item.username}</div>
                                <div className="mt-1 text-xs text-stone-500">{new Date(item.created_at).toLocaleString()}</div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <Button size="small" type="primary" icon={<Check className="size-3.5" />} loading={busyId === item.id} onClick={() => void review(item.id, "approved")}>
                                    {t("config.userReview.approve")}
                                </Button>
                                <Button size="small" danger icon={<X className="size-3.5" />} loading={busyId === item.id} onClick={() => void review(item.id, "disabled")}>
                                    {t("config.userReview.reject")}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? t("config.userReview.loading") : t("config.userReview.empty")} />
            )}

            <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold">{t("config.userReview.passwordResetTitle")}</div>
                    <div className="mt-1 text-xs text-stone-500">{t("config.userReview.passwordResetDescription")}</div>
                </div>
            </div>
            {resetItems.length ? (
                <div className="space-y-2">
                    {resetItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{item.username}</div>
                                <div className="mt-1 text-xs text-stone-500">{new Date(item.created_at).toLocaleString()}</div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <Button size="small" type="primary" icon={<Check className="size-3.5" />} loading={busyId === item.id} onClick={() => void reviewReset(item.id, true)}>
                                    {t("config.userReview.passwordResetApprove")}
                                </Button>
                                <Button size="small" danger icon={<X className="size-3.5" />} loading={busyId === item.id} onClick={() => void reviewReset(item.id, false)}>
                                    {t("config.userReview.passwordResetReject")}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("config.userReview.passwordResetEmpty")} />
            )}
        </div>
    );
}
