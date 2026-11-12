import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { App, Button, Input, Modal, Tabs } from "antd";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { brand } from "@/constant/brand";
import { completePasswordReset, getPasswordResetStatus, requestPasswordReset, type AccessStatus, type PasswordResetStatus } from "@/services/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";

const PASSWORD_RESET_STORAGE_KEY = "infinite-canvas:password-reset";

type StoredResetRequest = { requestId: string; secret: string; username: string };

function createResetSecret() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function readStoredResetRequest(): StoredResetRequest | null {
    try {
        // 找回申请必须在关闭标签页后仍能继续，因此使用 localStorage；旧版本存在 sessionStorage 的值会迁移过来。
        const stored = localStorage.getItem(PASSWORD_RESET_STORAGE_KEY) || sessionStorage.getItem(PASSWORD_RESET_STORAGE_KEY);
        if (!stored) return null;
        const parsed = JSON.parse(stored) as Partial<StoredResetRequest>;
        if (!parsed.requestId || !parsed.secret) return null;
        localStorage.setItem(PASSWORD_RESET_STORAGE_KEY, stored);
        sessionStorage.removeItem(PASSWORD_RESET_STORAGE_KEY);
        return { requestId: parsed.requestId, secret: parsed.secret, username: parsed.username || "" };
    } catch {
        return null;
    }
}

function clearStoredResetRequest() {
    localStorage.removeItem(PASSWORD_RESET_STORAGE_KEY);
    sessionStorage.removeItem(PASSWORD_RESET_STORAGE_KEY);
}

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
    const [resetOpen, setResetOpen] = useState(false);
    const [resetUsername, setResetUsername] = useState("");
    const [resetRequest, setResetRequest] = useState<StoredResetRequest | null>(null);
    const [resetStatus, setResetStatus] = useState<PasswordResetStatus | "">("");
    const [resetBusy, setResetBusy] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const resetHydratedRef = useRef(false);

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

    useEffect(() => {
        if (!initialized || resetHydratedRef.current) return;
        resetHydratedRef.current = true;
        if (useAuthStore.getState().user?.accessStatus === "已通过") {
            clearStoredResetRequest();
            return;
        }
        const stored = readStoredResetRequest();
        if (!stored) return;
        setResetRequest(stored);
        setResetUsername(stored.username);
        setResetStatus("待确认");
        setResetOpen(true);
    }, [initialized]);

    useEffect(() => {
        if (!resetRequest || resetStatus !== "待确认") return;
        let active = true;
        const check = async () => {
            try {
                const status = await getPasswordResetStatus(resetRequest.requestId, resetRequest.secret);
                if (!active) return;
                if (status === "已确认") {
                    setResetStatus("已确认");
                    setResetOpen(true);
                    message.success(t("auth.resetApproved"));
                } else if (status === "已拒绝") {
                    clearStoredResetRequest();
                    setResetRequest(null);
                    setResetStatus("");
                    setResetOpen(false);
                    message.info(t("auth.resetRejected"));
                } else if (status === "已使用") {
                    clearStoredResetRequest();
                    setResetOpen(false);
                    setResetRequest(null);
                    setResetStatus("");
                }
            } catch (error) {
                if (active && error instanceof Error && error.message === t("auth.resetInvalid")) {
                    clearStoredResetRequest();
                    setResetRequest(null);
                    setResetStatus("");
                }
                // 其他轮询失败不打扰用户，下一轮继续尝试。
            }
        };
        void check();
        const timer = window.setInterval(() => void check(), 3000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [message, resetRequest, resetStatus, t]);

    const clearReset = () => {
        clearStoredResetRequest();
        setResetOpen(false);
        setResetRequest(null);
        setResetStatus("");
        setResetBusy(false);
        setNewPassword("");
        setConfirmPassword("");
    };

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
            clearReset();
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

    const submitResetRequest = async () => {
        const name = resetUsername.trim();
        if (!name) {
            message.warning(t("auth.username"));
            return;
        }
        setResetBusy(true);
        const secret = createResetSecret();
        try {
            const result = await requestPasswordReset(name, secret);
            const request = { requestId: result.requestId, secret, username: name };
            setResetRequest(request);
            setResetStatus("待确认");
            localStorage.setItem(PASSWORD_RESET_STORAGE_KEY, JSON.stringify(request));
            message.success(t("auth.resetSubmitted"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("auth.resetRequestFailed"));
        } finally {
            setResetBusy(false);
        }
    };

    const submitNewPassword = async () => {
        if (!resetRequest) return;
        if (newPassword.length < 6) {
            message.warning(t("auth.passwordTooShort"));
            return;
        }
        if (newPassword !== confirmPassword) {
            message.warning(t("auth.passwordMismatch"));
            return;
        }
        setResetBusy(true);
        try {
            await completePasswordReset(resetRequest.requestId, resetRequest.secret, newPassword);
            const loginName = resetUsername || resetRequest.username;
            clearReset();
            setUsername(loginName);
            setPassword("");
            setActiveKey("login");
            message.success(t("auth.resetSuccess"));
        } catch (error) {
            const reason = error instanceof Error ? error.message : t("auth.failed");
            message.error(reason);
            if (reason === t("auth.resetNotApproved")) retryReset();
        } finally {
            setResetBusy(false);
        }
    };

    const retryReset = () => {
        clearStoredResetRequest();
        setResetRequest(null);
        setResetStatus("");
        setNewPassword("");
        setConfirmPassword("");
        setResetBusy(false);
    };

    const resetLocked = Boolean(resetRequest) && (resetStatus === "待确认" || resetStatus === "已确认");

    return (
        <>
            {protectedPath && (!initialized || !routeVerified || modalOpen) ? <div className="h-full bg-background" /> : children}
            <Modal
                open={modalOpen && !resetLocked}
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
                        <div className="mt-3"><button type="button" className="text-sm text-[#a21621] hover:underline" onClick={() => { setResetUsername(username); setResetOpen(true); }}>{t("auth.forgotPassword")}</button></div>
                    </div>
                ) : (
                    <>
                        <Tabs activeKey={activeKey} onChange={setActiveKey} items={[{ key: "login", label: t("auth.loginTab") }, { key: "register", label: t("auth.registerTab") }]} />
                        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                            <Input size="large" autoComplete="username" prefix={<UserRound className="size-4 text-stone-400" />} placeholder={t("auth.username")} value={username} onChange={(event) => setUsername(event.target.value)} maxLength={254} required />
                            <Input.Password size="large" autoComplete={activeKey === "login" ? "current-password" : "new-password"} prefix={<LockKeyhole className="size-4 text-stone-400" />} placeholder={t("auth.password")} value={password} onChange={(event) => setPassword(event.target.value)} required />
                            {activeKey === "login" ? (
                                <div className="flex items-center justify-between gap-3 py-1">
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600 dark:text-stone-300"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="accent-[#a21621]" />{t("auth.remember")}</label>
                                    <button type="button" className="shrink-0 text-sm text-[#a21621] hover:underline" onClick={() => { setResetUsername(username); setResetOpen(true); }}>{t("auth.forgotPassword")}</button>
                                </div>
                            ) : <p className="text-xs leading-5 text-stone-500">{t("auth.registrationReview")}</p>}
                            <Button htmlType="submit" type="primary" size="large" block loading={busy} icon={activeKey === "login" ? <ArrowRight className="size-4" /> : undefined} iconPlacement="end" className="!mt-4 !h-11 !rounded-lg !bg-[#a21621]">
                                {activeKey === "login" ? t("auth.login") : t("auth.register")}
                            </Button>
                        </form>
                    </>
                )}
            </Modal>

            <Modal
                open={resetOpen || resetLocked}
                title={t("auth.resetTitle")}
                footer={null}
                onCancel={() => { if (!resetLocked) setResetOpen(false); }}
                closable={!resetLocked}
                maskClosable={!resetLocked}
                keyboard={!resetLocked}
                width={400}
                centered
                destroyOnHidden
            >
                {resetStatus === "待确认" ? (
                    <div className="py-6 text-center">
                        <div className="text-sm font-semibold">{resetUsername || resetRequest?.username}</div>
                        <p className="mt-3 text-sm leading-6 text-stone-500">{t("auth.resetWaiting")}</p>
                    </div>
                ) : resetStatus === "已确认" ? (
                    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitNewPassword(); }}>
                        <p className="text-xs leading-5 text-stone-500">{t("auth.resetApproved")}</p>
                        <Input.Password size="large" autoComplete="new-password" prefix={<LockKeyhole className="size-4 text-stone-400" />} placeholder={t("auth.newPassword")} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                        <Input.Password size="large" autoComplete="new-password" prefix={<LockKeyhole className="size-4 text-stone-400" />} placeholder={t("auth.confirmPassword")} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
                        <Button htmlType="submit" type="primary" size="large" block loading={resetBusy} className="!mt-4 !h-11 !rounded-lg !bg-[#a21621]">{t("auth.resetPasswordSubmit")}</Button>
                    </form>
                ) : (
                    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitResetRequest(); }}>
                        <p className="text-xs leading-5 text-stone-500">{t("auth.resetDescription")}</p>
                        <Input size="large" autoComplete="username" prefix={<UserRound className="size-4 text-stone-400" />} placeholder={t("auth.username")} value={resetUsername} onChange={(event) => setResetUsername(event.target.value)} maxLength={254} required />
                        <Button htmlType="submit" type="primary" size="large" block loading={resetBusy} className="!mt-4 !h-11 !rounded-lg !bg-[#a21621]">{t("auth.resetSubmit")}</Button>
                    </form>
                )}
            </Modal>
        </>
    );
}
