import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { App, Dropdown, Tooltip, type MenuProps } from "antd";
import { BookOpen, Coins, Crown, Keyboard, LogOut, Moon, Puzzle, Settings2, Sun, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CreditsModal, MembershipModal, ProfileModal } from "@/components/layout/account-modals";
import { GitHubLink } from "@/components/layout/github-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { topBarEntries } from "@/constant/brand";
import { DOCS_URL } from "@/constant/env";
import { changeAppLocale, type AppLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { useAccountStore } from "@/stores/use-account-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { useAuthStore } from "@/stores/use-auth-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, onOpenPlugins }: UserStatusActionsProps) {
    const { i18n, t } = useTranslation();
    const { message } = App.useApp();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const clearSession = useUserStore((state) => state.clearSession);
    const logoutAccount = useAuthStore((state) => state.logout);
    const credits = useAccountStore((state) => state.credits);
    const profile = useAccountStore((state) => state.profile);
    const loaded = useAccountStore((state) => state.loaded);
    const loadAccount = useAccountStore((state) => state.load);
    const [creditsOpen, setCreditsOpen] = useState(false);
    const [membershipOpen, setMembershipOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    useEffect(() => {
        if (!loaded) void loadAccount().catch(() => undefined);
    }, [loadAccount, loaded]);

    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-black/5 hover:text-stone-950 dark:hover:bg-white/10 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const pillStyle: CSSProperties | undefined = variant === "canvas" ? { borderColor: canvasTheme.toolbar.border, color: canvasTheme.node.text } : undefined;
    const locale = i18n.resolvedLanguage as AppLocale;
    const nextLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
    const languageLabel = t("topNav.switchLanguage", { language: t(nextLocale === "zh-CN" ? "locale.zhCN" : "locale.enUS") });
    const avatarText = (profile.name || t("account.defaultName")).slice(0, 1).toUpperCase();
    const menuItems: MenuProps["items"] = [
        { key: "profile", icon: <UserRound className="size-4" />, label: t("account.profile") },
        ...(showConfig ? [{ key: "settings", icon: <Settings2 className="size-4" />, label: t("account.settings") }] : []),
        { key: "theme", icon: theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />, label: theme === "dark" ? t("topNav.lightTheme") : t("topNav.darkTheme") },
        { type: "divider" },
        { key: "logout", icon: <LogOut className="size-4" />, label: t("account.logout"), danger: true },
    ];

    return (
        <>
            <div className="inline-flex shrink-0 items-center gap-1.5">
                {topBarEntries.language ? (
                    <Tooltip title={languageLabel} mouseEnterDelay={0.2}>
                        <button
                            type="button"
                            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                            style={iconStyle}
                            onClick={() => void changeAppLocale(nextLocale)}
                            aria-label={languageLabel}
                        >
                            <b className={cn("font-semibold", locale !== "zh-CN" && "opacity-40")}>中</b>
                            <span className="opacity-30">/</span>
                            <b className={cn("font-semibold", locale !== "en-US" && "opacity-40")}>EN</b>
                        </button>
                    </Tooltip>
                ) : null}

                {topBarEntries.shortcuts && onOpenShortcuts ? (
                    <Tooltip title={t("topNav.shortcuts")} mouseEnterDelay={0.2}>
                        <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label={t("topNav.shortcuts")}>
                            <Keyboard />
                        </button>
                    </Tooltip>
                ) : null}

                {topBarEntries.credits ? (
                    <Tooltip title={t("account.creditsTitle")} mouseEnterDelay={0.2}>
                        <button
                            type="button"
                            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 text-sm transition-colors hover:bg-black/5 dark:border-stone-700 dark:hover:bg-white/10"
                            style={pillStyle}
                            onClick={() => setCreditsOpen(true)}
                        >
                            <Coins className="size-4 text-amber-500" />
                            <span className="font-semibold tabular-nums">{loaded ? credits.toLocaleString() : "--"}</span>
                            <span className="text-stone-500 dark:text-stone-400">{t("account.creditsShort")}</span>
                        </button>
                    </Tooltip>
                ) : null}

                {topBarEntries.membership ? (
                    <button
                        type="button"
                        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/15 dark:text-red-300"
                        onClick={() => setMembershipOpen(true)}
                    >
                        <Crown className="size-4" />
                        {t("account.membership")}
                    </button>
                ) : null}

                {topBarEntries.avatar ? (
                    <Dropdown
                        trigger={["click"]}
                        placement="bottomRight"
                        menu={{
                            items: menuItems,
                            onClick: ({ key }) => {
                                if (key === "profile") setProfileOpen(true);
                                if (key === "settings") openConfigDialog(false);
                                if (key === "theme") setTheme(theme === "dark" ? "light" : "dark");
                                if (key === "logout") {
                                    clearSession();
                                    logoutAccount();
                                    message.success(t("account.loggedOut"));
                                }
                            },
                        }}
                    >
                        <button
                            type="button"
                            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-stone-300 bg-stone-100 text-sm font-semibold transition hover:brightness-105 dark:border-stone-600 dark:bg-stone-800"
                            style={variant === "canvas" ? { borderColor: canvasTheme.node.stroke, background: canvasTheme.node.fill, color: canvasTheme.node.text } : undefined}
                            aria-label={t("account.profile")}
                            title={profile.name}
                        >
                            {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="size-full rounded-full object-cover" /> : avatarText}
                        </button>
                    </Dropdown>
                ) : null}

                {topBarEntries.plugins && onOpenPlugins ? (
                    <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenPlugins} aria-label={t("topNav.plugins")} title={t("topNav.plugins")}>
                        <Puzzle />
                    </button>
                ) : null}
                {topBarEntries.docs ? (
                    <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label={t("topNav.docs")} title={t("topNav.docs")}>
                        <BookOpen />
                    </a>
                ) : null}
                {topBarEntries.config && showConfig ? (
                    <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label={t("navigation.config")} title={t("navigation.config")}>
                        <Settings2 />
                    </button>
                ) : null}
                {topBarEntries.version ? <VersionReleaseModal style={iconStyle} /> : null}
                {topBarEntries.github ? <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", "size-7 text-base")} style={iconStyle} /> : null}
            </div>

            <CreditsModal open={creditsOpen} onClose={() => setCreditsOpen(false)} />
            <MembershipModal open={membershipOpen} onClose={() => setMembershipOpen(false)} />
            <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
        </>
    );
}
