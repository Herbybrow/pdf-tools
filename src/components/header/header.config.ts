import {
  ChevronDown,
  Headset,
  Maximize,
  Menu,
  Minimize,
  Moon,
  Sun,
  X,
} from "lucide-react";
import type { HeaderBrand, ToolsNavItem } from "./types";

export const HEADER_ICONS = {
  moon: Moon,
  sun: Sun,
  maximize: Maximize,
  minimize: Minimize,
  menu: Menu,
  close: X,
  chevron: ChevronDown,
  support: Headset,
};

/** Rename / restyle the chrome here without touching Header layout code. */
export const HEADER_BRAND: HeaderBrand = {
  title: "NSSF PDF Tools",
  logoSrc: "/NSSF.jpg",
  logoAlt: "NSSF logo",
  user: {
    name: "Mussa Said",
    initials: "MS",
  },
  support: {
    label: "Support Desk",
    href: "/support",
    icon: HEADER_ICONS.support,
  },
};

export const HEADER_COLORS = {
  maroon: "#902d30",
  gold: "#f9c000",
  active: "#d61f26",
  avatarText: "#902d30",
} as const;

export const TOOLS_NAV_ITEMS: ToolsNavItem[] = [
  { id: "merge", label: "Merge PDF", href: "/tools/merge-pdf" },
  { id: "split", label: "Split PDF", href: "/tools/split-pdf" },
  { id: "compress", label: "Compress PDF", href: "/tools/compress-pdf" },
  { id: "convert", label: "Convert PDF", href: "/tools/convert-pdf", menu: "convert" },
  { id: "all", label: "All PDF Tools", href: "/tools", menu: "all" },
];
