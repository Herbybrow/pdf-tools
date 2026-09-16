"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { HEADER_COLORS } from "./header.config";
import { CATEGORY_TITLES_SW } from "./tools-menu.config";
import type { ToolsMenuConfig } from "./types";
import { cn } from "@/lib/cn";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type ToolsDropdownPanelProps = {
  id: string;
  categories: ToolsMenuConfig;
  columnsClassName: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  pointerOffset: number;
  onNavigate?: () => void;
};

export function ToolsDropdownPanel({
  id,
  categories,
  columnsClassName,
  panelClassName,
  panelStyle,
  pointerOffset,
  onNavigate,
}: ToolsDropdownPanelProps) {
  const { language } = useLanguage();
  const isSw = language === "sw";
  return (
    <div
      id={id}
      role="menu"
      className={cn(
        "absolute top-full z-50 rounded-b-2xl border border-black/5 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.16)]",
        panelClassName,
      )}
      style={panelStyle}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-2 h-0 w-0 border-x-8 border-b-8 border-x-transparent border-b-white"
        style={{ left: pointerOffset, transform: "translateX(-50%)" }}
      />
      <div className={cn("relative grid gap-x-8 gap-y-6 px-7 py-6", columnsClassName)}>
        {categories.map((category) => (
          <section key={category.title} className="min-w-0">
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
              {(isSw && CATEGORY_TITLES_SW[category.title]) || category.title}
            </h3>
            <ul className="space-y-1">
              {category.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href + item.label}>
                    <Link
                      href={item.href}
                      role="menuitem"
                      onClick={onNavigate}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-xl p-2 text-sm font-medium transition-all duration-200 hover:bg-maroon/5",
                        item.popular ? "text-nav-active" : "text-gray-800 hover:text-gray-950",
                      )}
                      style={item.popular ? { color: HEADER_COLORS.active } : undefined}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-maroon/10 transition-all duration-200 group-hover:bg-maroon group-hover:shadow-sm">
                        <Icon
                          className={cn(
                            "h-5 w-5 shrink-0 transition-colors duration-200 group-hover:text-white",
                            item.iconClassName ?? "text-maroon",
                          )}
                          aria-hidden
                        />
                      </span>
                      <span>{(isSw && item.labelSw) || item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
