import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { App, Button, Input, Modal, Tabs } from "antd";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { brand } from "@/constant/brand";
import type { AccessStatus } from "@/services/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";

export function AuthGate({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const initialize = useAuthStore((state) => state.initialize);
    const refresh = useAuthStore((state) => state.refresh);
    const [activeKey, setActiveKey] = useState("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(() => sessionStorage.getItem("infinite-canvas:remember-session") !== "1");
    const [busy, setBusy] = useState(false);
    const [routeVerified, setRouteVerified] = useState(false);

    const protectedPath = location.pathname === "/canvas" || location.pathname.startsWith("/canvas/") || ["/prompts", "/assets", "/config"].includes(location.pathname);
    const initialized = useAuthStore((state) => state.initialized);
    const modalOpen = initialized && routeVerified && protectedPath && user?.accessStatus !== "已通过";

    useEffect(() => initialize(), [initialize]);

    useLayoutEffect(() => {
        let active = true;
        setRouteVerified(false);
        if (!protectedPath) {
            setRouteVerified(true);
            return () => { active = false; };
        }
        void refresh().finally(() => { if (active) setRouteVerified(true); });
        return () => { active = false; };
    }, [location.pathname, protectedPath, refresh]);

    useEffect(() => {
        if (user?.accessStatus === "未通过") {
            logout();
            message.error(t("auth.disabled"));
        }
    }, [logout, message, t, user?.accessStatus]);

    const submit = async () => {
        const auth = useAuthStore.getState();
        setBusy(true);
        try {
            if (activeKey === "register") {
                await auth.register(username, password);
                setActiveKey("login");
                setPassword("");
                message.success(t("auth.registered"));
                return;
            }
            await auth.login(username, password, remember);
            const status: AccessStatus | undefined = useAuthStore.getState().user?.accessStatus;
            if (status === "待审核") message.info(t("auth.pending"));
            else if (status === "未通过") {
                auth.logout();
                message.error(t("auth.disabled"));
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("auth.failed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {protectedPath && (!initialized || !routeVerified || modalOpen) ? <div className="h-full bg-background" /> : children}
            <Modal
                open={modalOpen}
                centered
                closable
                maskClosable={false}
                keyboard={false}
                onCancel={() => navigate("/")}
                footer={null}
                width={420}
                className="auth-gate-modal"
                styles={{ content: { borderRadius: 18, padding: 0, overflow: "hidden" }, body: { padding: 28 } }}
            >
                <div className="mb-7 flex items-center gap-3">
                    <img src={brand.logo} alt="" className="h-9 w-auto" />
                    <div><div className="text-base font-semibold text-stone-900 dark:text-stone-100">{brand.name} {brand.product}</div><div className="mt-1 text-xs text-stone-500">{t("auth.subtitle")}</div></div>
                </div>
                {user?.accessStatus === "待审核" ? (
                    <div className="py-7 text-center">
                        <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-50 text-amber-700"><LockKeyhole className="size-5" /></div>
                        <h2 className="mt-4 text-lg font-semibold">{t("auth.pendingTitle")}</h2>
                        <p className="mt-2 text-sm leading-6 text-stone-500">{t("auth.pending")}</p>
                        <Button className="mt-6" onClick={() => { logout(); setActiveKey("login"); }}>{t("auth.logout")}</Button>
                    </div>
                ) : (
                    <>
                        <Tabs activeKey={activeKey} onChange={setActiveKey} items={[{ key: "login", label: t("auth.loginTab") }, { key: "register", label: t("auth.registerTab") }]} />
                        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                            <Input size="large" autoComplete="username" prefix={<UserRound className="size-4 text-stone-400" />} placeholder={t("auth.username")} value={username} onChange={(event) => setUsername(event.target.value)} maxLength={254} required />
                            <Input.Password size="large" autoComplete={activeKey === "login" ? "current-password" : "new-password"} prefix={<LockKeyhole className="size-4 text-stone-400" />} placeholder={t("auth.password")} value={password} onChange={(event) => setPassword(event.target.value)} required />
                            {activeKey === "login" ? (
                                <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-stone-600 dark:text-stone-300"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="accent-[#a21621]" />{t("auth.remember")}</label>
                            ) : <p className="text-xs leading-5 text-stone-500">{t("auth.registrationReview")}</p>}
                            <Button htmlType="submit" type="primary" size="large" block loading={busy} icon={activeKey === "login" ? <ArrowRight className="size-4" /> : undefined} iconPlacement="end" className="!mt-4 !h-11 !rounded-lg !bg-[#a21621]">
                                {activeKey === "login" ? t("auth.login") : t("auth.register")}
                            </Button>
                        </form>
                    </>
                )}
            </Modal>
        </>
    );
}
