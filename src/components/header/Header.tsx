"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HEADER_BRAND, HEADER_COLORS, HEADER_ICONS, TOOLS_NAV_ITEMS } from "./header.config";
import { ALL_PDF_TOOLS_MENU, CATEGORY_TITLES_SW, CONVERT_PDF_MENU } from "./tools-menu.config";
import { ToolsDropdownPanel } from "./ToolsDropdownPanel";
import type {
  HeaderBrand,
  SupportLink,
  ToolsMenuConfig,
  ToolsNavItem,
} from "./types";
import { cn } from "@/lib/cn";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

const NAV_LABEL_KEYS: Record<string, TranslationKey> = {
  merge: "nav.mergePdf",
  split: "nav.splitPdf",
  compress: "nav.compressPdf",
  convert: "nav.convertPdf",
  all: "nav.allTools",
};

export type HeaderProps = {
  title?: string;
  logoSrc?: string;
  logoAlt?: string;
  userName?: string;
  userInitials?: string;
  navItems?: ToolsNavItem[];
  convertMenu?: ToolsMenuConfig;
  allToolsMenu?: ToolsMenuConfig;
  support?: SupportLink;
  activeHref?: string;
};

const circleBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/40 text-white transition-colors hover:bg-white/10";

function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const next = language === "en" ? "sw" : "en";
  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      title={language === "en" ? "Badilisha kwa Kiswahili" : "Switch to English"}
      aria-label={language === "en" ? "Badilisha kwa Kiswahili" : "Switch to English"}
      className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-white/40 px-3 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
    >
      {language === "en" ? "SW" : "EN"}
    </button>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function TopBar({
  title = HEADER_BRAND.title,
  logoSrc = HEADER_BRAND.logoSrc,
  logoAlt = HEADER_BRAND.logoAlt,
}: Pick<HeaderProps, "title" | "logoSrc" | "logoAlt">) {
  const [isDark, setIsDark] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("theme") === "dark");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const ThemeIcon = isDark ? HEADER_ICONS.sun : HEADER_ICONS.moon;
  const FullscreenIcon = isFullscreen ? HEADER_ICONS.minimize : HEADER_ICONS.maximize;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    window.localStorage.setItem("theme", next ? "dark" : "light");
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  return (
    <div className="relative h-[60px]" style={{ backgroundColor: HEADER_COLORS.maroon }}>
      <div className="absolute left-4 top-0 z-50">
        <Link href="/" aria-label={logoAlt} className="block">
          <Image
            src={logoSrc}
            alt={logoAlt}
            width={216}
            height={305}
            priority
            className="mr-7 block h-[100px] w-auto max-w-none"
            style={{
              height: "100px",
              boxShadow: "0 1px 4px rgba(0,0,0,.3), inset 0 0 40px rgba(0,0,0,.1)",
            }}
          />
        </Link>
      </div>

      <div className="flex h-full items-center justify-between pl-32 pr-4 sm:pr-6">
        <h1 className="min-w-0 truncate pr-4 font-sans text-base font-bold uppercase tracking-wide text-white lg:text-xl">
          <Link href="/" className="text-white hover:text-white/90">
            {title}
          </Link>
        </h1>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageToggle />

          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className={circleBtnClass}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <ThemeIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className={circleBtnClass}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <FullscreenIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

type OpenMenu = "convert" | "all" | null;

type PanelLayout = {
  left: number;
  width: number;
  pointerOffset: number;
};

export function ToolsNavBar({
  navItems = TOOLS_NAV_ITEMS,
  convertMenu = CONVERT_PDF_MENU,
  allToolsMenu = ALL_PDF_TOOLS_MENU,
  support = HEADER_BRAND.support,
  activeHref,
}: Pick<HeaderProps, "navItems" | "convertMenu" | "allToolsMenu" | "support" | "activeHref">) {
  const pathname = usePathname();
  const currentHref = activeHref ?? pathname;
  const { t, language } = useLanguage();
  const isSw = language === "sw";
  const navLabel = (item: ToolsNavItem) => {
    const key = NAV_LABEL_KEYS[item.id];
    return key ? t(key) : item.label;
  };
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<OpenMenu>(null);
  const [panelLayout, setPanelLayout] = useState<PanelLayout>({ left: 0, width: 520, pointerOffset: 80 });
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close any open menu on navigation. Adjusted during render (React's documented
  // pattern for "reset state when a value changes") rather than in an effect, so it
  // takes effect before paint instead of causing an extra post-navigation render.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpenMenu(null);
    setMobileOpen(false);
    setMobileSection(null);
  }
  const navRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Partial<Record<Exclude<OpenMenu, null>, HTMLButtonElement | null>>>({});
  const convertPanelId = useId();
  const allPanelId = useId();
  const Chevron = HEADER_ICONS.chevron;
  const MenuIcon = mobileOpen ? HEADER_ICONS.close : HEADER_ICONS.menu;
  const SupportIcon = support.icon;

  const menus: Record<Exclude<OpenMenu, null>, ToolsMenuConfig> = {
    convert: convertMenu,
    all: allToolsMenu,
  };

  const updatePanelLayout = useCallback(() => {
    if (!openMenu) return;
    const navEl = navRef.current;
    const triggerEl = triggerRefs.current[openMenu];
    if (!navEl || !triggerEl) return;

    const navBox = navEl.getBoundingClientRect();
    const triggerBox = triggerEl.getBoundingClientRect();
    const pointer = triggerBox.left + triggerBox.width / 2 - navBox.left;

    if (openMenu === "convert") {
      const width = Math.min(560, navBox.width - 16);
      let left = triggerBox.left - navBox.left - 28;
      left = Math.max(8, Math.min(left, navBox.width - width - 8));
      setPanelLayout({
        left,
        width,
        pointerOffset: Math.min(Math.max(16, pointer - left), width - 16),
      });
      return;
    }

    const left = 8;
    const width = navBox.width - 16;
    setPanelLayout({
      left,
      width,
      pointerOffset: Math.min(Math.max(16, pointer - left), width - 16),
    });
  }, [openMenu]);

  useEffect(() => {
    updatePanelLayout();
  }, [updatePanelLayout]);

  useEffect(() => {
    if (!openMenu) return;
    const onResize = () => updatePanelLayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [openMenu, updatePanelLayout]);

  useEffect(() => {
    if (!openMenu && !mobileOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (navRef.current?.contains(target)) return;
      setOpenMenu(null);
      setMobileOpen(false);
      setMobileSection(null);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenu(null);
      setMobileOpen(false);
      setMobileSection(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu, mobileOpen]);

  const toggleMenu = (menu: Exclude<OpenMenu, null>) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const closeAll = () => {
    setOpenMenu(null);
    setMobileOpen(false);
    setMobileSection(null);
  };

  const isItemActive = (item: ToolsNavItem) => {
    if (item.menu && openMenu === item.menu) return true;
    return currentHref === item.href;
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>, menu: Exclude<OpenMenu, null>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleMenu(menu);
    }
  };

  const renderDesktopLink = (item: ToolsNavItem) => {
    const active = isItemActive(item);
    const className = cn(
      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-sans text-xs font-bold uppercase tracking-wide transition-colors lg:text-sm",
      active ? "bg-maroon text-white" : "text-gray-900 hover:bg-black/5 hover:text-[color:var(--header-active)]",
    );

    if (item.menu) {
      const isOpen = openMenu === item.menu;
      const panelId = item.menu === "convert" ? convertPanelId : allPanelId;
      return (
        <button
          key={item.id}
          type="button"
          ref={(node) => {
            triggerRefs.current[item.menu!] = node;
          }}
          className={className}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-controls={panelId}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            toggleMenu(item.menu!);
          }}
          onKeyDown={(event) => onTriggerKeyDown(event, item.menu!)}
        >
          {navLabel(item)}
          <Chevron
            className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")}
            aria-hidden
          />
        </button>
      );
    }

    return (
      <Link key={item.id} href={item.href} className={className} onClick={closeAll}>
        {navLabel(item)}
      </Link>
    );
  };

  return (
    <nav
      ref={navRef}
      className="relative z-40 flex h-[40px] items-center justify-between pl-28 pr-4 sm:pr-6"
      style={{ backgroundColor: HEADER_COLORS.gold }}
      aria-label="PDF tools"
    >
      <div className="hidden items-center gap-5 lg:flex xl:gap-7">{navItems.map(renderDesktopLink)}</div>

      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-900 hover:bg-black/10 lg:hidden"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileOpen}
        onClick={() => {
          setMobileOpen((open) => !open);
          setOpenMenu(null);
        }}
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <Link
        href={support.href}
        className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-gray-900 hover:text-[color:var(--header-maroon)]"
      >
        <SupportIcon className="h-5 w-5 shrink-0" aria-hidden />
        <span>{t("nav.support")}</span>
      </Link>

      {openMenu ? (
        <ToolsDropdownPanel
          id={openMenu === "convert" ? convertPanelId : allPanelId}
          categories={menus[openMenu]}
          columnsClassName={
            openMenu === "convert"
              ? "grid-cols-2"
              : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
          }
          panelClassName="hidden lg:block"
          panelStyle={{ left: panelLayout.left, width: panelLayout.width }}
          pointerOffset={panelLayout.pointerOffset}
          onNavigate={closeAll}
        />
      ) : null}

      {mobileOpen && (
        <div className="absolute left-0 right-0 top-full z-50 max-h-[70vh] overflow-y-auto border-t border-black/10 bg-[#f9c000] shadow-lg lg:hidden">
          <ul className="flex flex-col py-2">
            {navItems.map((item) => {
              const active = currentHref === item.href || (item.menu && mobileSection === item.menu);
              if (item.menu) {
                const isOpen = mobileSection === item.menu;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-5 py-3 text-left font-sans text-sm font-bold uppercase tracking-wide"
                      style={{ color: active ? HEADER_COLORS.active : "#111827" }}
                      aria-expanded={isOpen}
                      onClick={() => setMobileSection((current) => (current === item.menu ? null : item.menu!))}
                    >
                      {navLabel(item)}
                      <Chevron className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && (
                      <div className="space-y-4 bg-white px-5 py-4">
                        {menus[item.menu].map((category) => (
                          <section key={category.title}>
                            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                              {(isSw && CATEGORY_TITLES_SW[category.title]) || category.title}
                            </h3>
                            <ul className="space-y-1">
                              {category.items.map((menuItem) => {
                                const Icon = menuItem.icon;
                                return (
                                  <li key={menuItem.href + menuItem.label}>
                                    <Link
                                      href={menuItem.href}
                                      onClick={closeAll}
                                      className="flex items-center gap-2.5 py-1.5 text-sm font-medium"
                                      style={{
                                        color: menuItem.popular ? HEADER_COLORS.active : "#1f2937",
                                      }}
                                    >
                                      <Icon className={cn("h-5 w-5", menuItem.iconClassName)} />
                                      {(isSw && menuItem.labelSw) || menuItem.label}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        ))}
                      </div>
                    )}
                  </li>
                );
              }

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={closeAll}
                    className="block px-5 py-3 font-sans text-sm font-bold uppercase tracking-wide"
                    style={{ color: active ? HEADER_COLORS.active : "#111827" }}
                  >
                    {navLabel(item)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}

export default function Header(props: HeaderProps = {}) {
  const brand: HeaderBrand = {
    ...HEADER_BRAND,
    title: props.title ?? HEADER_BRAND.title,
    logoSrc: props.logoSrc ?? HEADER_BRAND.logoSrc,
    logoAlt: props.logoAlt ?? HEADER_BRAND.logoAlt,
    user: {
      name: props.userName ?? HEADER_BRAND.user.name,
      initials:
        props.userInitials ??
        (props.userName ? getInitials(props.userName) : HEADER_BRAND.user.initials),
    },
    support: props.support ?? HEADER_BRAND.support,
  };

  return (
    <header className="relative z-40 h-[100px] w-full overflow-visible font-sans shadow-md">
      <div className="flex flex-col">
        <TopBar title={brand.title} logoSrc={brand.logoSrc} logoAlt={brand.logoAlt} />
        <ToolsNavBar
          navItems={props.navItems}
          convertMenu={props.convertMenu}
          allToolsMenu={props.allToolsMenu}
          support={brand.support}
          activeHref={props.activeHref}
        />
      </div>
    </header>
  );
}
