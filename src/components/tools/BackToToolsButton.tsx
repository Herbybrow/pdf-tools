"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function BackToToolsButton() {
  const { t } = useLanguage();
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="group inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-700 shadow-sm transition-all hover:border-maroon/30 hover:bg-maroon hover:text-white hover:shadow-md active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" aria-hidden />
        {t("common.backToTools")}
      </Link>
    </div>
  );
}
