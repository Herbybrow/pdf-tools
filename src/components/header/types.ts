import type { LucideIcon } from "lucide-react";

export type ToolsMenuItem = {
  label: string;
  labelSw?: string;
  icon: LucideIcon;
  href: string;
  /** When true, the label renders in the active/popular red color. */
  popular?: boolean;
  /** Optional Tailwind classes for the stand-in file-type icon. */
  iconClassName?: string;
  description?: string;
  badge?: string;
};

export type ToolsMenuCategory = {
  title: string;
  items: ToolsMenuItem[];
};

export type ToolsMenuConfig = ToolsMenuCategory[];

export type ToolsNavItem = {
  id: string;
  label: string;
  href: string;
  /** Clicking toggles this dropdown instead of navigating. */
  menu?: "convert" | "all";
};

export type HeaderUser = {
  name: string;
  initials: string;
};

export type SupportLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type HeaderBrand = {
  title: string;
  logoSrc: string;
  logoAlt: string;
  user: HeaderUser;
  support: SupportLink;
};
