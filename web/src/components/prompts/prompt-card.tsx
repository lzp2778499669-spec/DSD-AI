import { Copy, FileText, FolderPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { type Prompt } from "@/services/api/prompts";

const ACTION_BUTTON_CLASS = "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-stone-900 hover:text-stone-900 dark:border-stone-700 dark:bg-transparent dark:text-stone-300 dark:hover:border-stone-100 dark:hover:text-stone-100";

export function PromptCard({
    item,
    onOpen,
    onCopy,
    onSaveAsset,
    compact = false,
}: {
    item: Prompt;
    onOpen: () => void;
    onCopy: () => void;
    onSaveAsset?: () => void;
    compact?: boolean;
}) {
    const { t } = useTranslation();
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200/70 bg-white transition-all duration-200 hover:-translate-y-1 hover:border-stone-300 hover:shadow-lg dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-600">
            <button type="button" className="block w-full cursor-pointer text-left" onClick={onOpen}>
                {item.coverUrl ? <img src={item.coverUrl} alt={item.title} className={`${compact ? "aspect-square" : "aspect-[4/3]"} w-full object-cover`} loading="lazy" /> : <span className={`${compact ? "aspect-square" : "aspect-[4/3]"} grid w-full place-items-center bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600`}><FileText className="size-8" /></span>}
            </button>
            <button type="button" className={compact ? "block w-full cursor-pointer text-left" : "block w-full flex-1 cursor-pointer text-left"} onClick={onOpen}>
                <div className={compact ? "px-3 py-2.5" : "px-4 pt-3"}>
                    <h2 className="truncate text-sm font-semibold text-stone-950 dark:text-stone-100">{item.title}</h2>
                    {!compact ? <p className="mt-1.5 truncate text-[13px] leading-5 text-stone-500 dark:text-stone-400">{item.description || item.prompt}</p> : null}
                </div>
            </button>
            {!compact ? (
                <>
                    <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                        {item.tags.map((tag) => <span key={tag} className="rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] leading-none text-stone-500 dark:border-stone-700 dark:text-stone-400">{tag}</span>)}
                    </div>
                    <div className="mt-auto flex gap-2 px-4 pb-4 pt-3">
                        <button type="button" className={ACTION_BUTTON_CLASS} onClick={onCopy}>
                            <Copy className="size-3.5" />
                            {t("common.copy")}
                        </button>
                        {onSaveAsset ? (
                            <button type="button" className={ACTION_BUTTON_CLASS} onClick={onSaveAsset}>
                                <FolderPlus className="size-3.5" />
                                {t("common.addToAssets")}
                            </button>
                        ) : null}
                    </div>
                </>
            ) : null}
        </div>
    );
}
