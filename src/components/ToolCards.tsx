"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCatalogTools, TOOL_CARD_FILTERS, type CatalogTool } from "@/components/header/tools-menu.config";
import { cn } from "@/lib/cn";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

type ToolCardsProps = {
  tools?: CatalogTool[];
};

export function ToolCards({ tools = getCatalogTools() }: ToolCardsProps) {
  const [filter, setFilter] = useState("all");
  const { t, language } = useLanguage();
  const isSw = language === "sw";

  const visibleTools = useMemo(() => {
    const active = TOOL_CARD_FILTERS.find((item) => item.id === filter);
    if (!active || active.id === "all") return tools;
    return tools.filter((tool) => active.titles.includes(tool.categoryTitle));
  }, [filter, tools]);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        {TOOL_CARD_FILTERS.map((item) => {
          const selected = item.id === filter;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors sm:px-4",
                selected
                  ? "border-maroon bg-maroon text-white shadow-md"
                  : "border-gray-200 text-gray-500 hover:border-maroon/30 hover:bg-black/5 hover:text-gray-800 dark:border-slate-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100",
              )}
            >
              {t(`filter.${item.id}` as TranslationKey)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="group relative overflow-hidden rounded-2xl border border-black/5 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-maroon/30 hover:shadow-[0_16px_32px_rgba(144,45,48,0.12)] dark:border-white/10 dark:bg-slate-800"
            >
              <span className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-linear-to-r from-maroon to-gold transition-transform duration-300 group-hover:scale-x-100" aria-hidden />

              {tool.badge ? (
                <span className="absolute right-4 top-4 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600">
                  {tool.badge}
                </span>
              ) : null}
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-maroon/10 shadow-sm transition-all duration-300 group-hover:bg-maroon group-hover:shadow-md dark:bg-maroon/20">
                <Icon
                  className={cn("h-6 w-6 transition-colors duration-300 group-hover:text-white", tool.iconClassName ?? "text-maroon")}
                  aria-hidden
                />
              </div>
              <h2 className="flex items-center justify-between text-lg font-bold text-gray-900 transition-colors group-hover:text-maroon dark:text-white">
                {(isSw && tool.labelSw) || tool.label}
                <ArrowRight className="h-4 w-4 -translate-x-1.5 text-maroon opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
              </h2>
              <p className="mt-1.5 text-sm leading-5 text-gray-500 dark:text-gray-400">{(isSw && tool.descriptionSw) || tool.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
