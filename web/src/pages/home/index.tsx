import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { brand } from "@/constant/brand";

export default function IndexPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const imageRef = useRef<HTMLImageElement>(null);

    return (
        <main
            className="relative h-full overflow-y-auto bg-[#bfbfbf] text-[#191919]"
            onPointerMove={(event) => {
                if (event.pointerType !== "mouse" || !imageRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const x = (event.clientX - bounds.left) / bounds.width - 0.5;
                const y = (event.clientY - bounds.top) / bounds.height - 0.5;
                imageRef.current.style.transform = `translate3d(${x * 18}px, ${y * 10}px, 0) scale(1.03)`;
            }}
            onPointerLeave={() => { if (imageRef.current) imageRef.current.style.transform = ""; }}
        >
            <section className="relative isolate min-h-[calc(100dvh-3.5rem)] overflow-hidden">
                <img ref={imageRef} src="/home/ai-world.jpg" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[35%_bottom] transition-transform duration-500 ease-out motion-reduce:transition-none md:object-left-bottom" />
                <div className="pointer-events-none absolute inset-0 bg-[#bfbfbf]/35 md:bg-transparent" />
                <div className="relative mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[1440px] items-start px-6 pb-20 pt-12 sm:px-10 md:items-center md:justify-end md:px-16 md:py-20">
                    <div className="w-full max-w-xl md:w-[42%]">
                        <p className="text-sm font-medium text-[#a21621]">{brand.name} {brand.product}</p>
                        <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.16] sm:text-5xl lg:text-6xl">{brand.title}</h1>
                        <p className="mt-6 max-w-md text-base leading-8 text-[#343434] sm:text-lg">{t("meta.description")}</p>
                        <button type="button" onClick={() => navigate("/canvas")} className="mt-9 inline-flex h-12 items-center gap-8 rounded-xl border border-transparent bg-[#1c1c1c] px-6 text-sm font-medium text-white transition hover:bg-[#a21621] active:translate-y-px">
                            {t("home.openCanvas")}<ArrowRight className="size-4" />
                        </button>
                    </div>
                </div>
            </section>
        </main>
    );
}
