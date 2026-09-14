import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type ToolPageHeaderProps = {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  description?: string;
};

/** Shared header for every tool page (config-driven and bespoke alike): an icon badge
 * carrying the tool's own brand color, the title, and its description, with a brief
 * fade-in-up entrance so a fresh tool page doesn't just snap into a wall of plain text --
 * kept to a single quick, non-bouncy animation rather than per-element flourishes, in
 * line with an official/enterprise tone rather than a playful consumer one. */
export default function ToolPageHeader({ icon: Icon, iconClassName, title, description }: ToolPageHeaderProps) {
  return (
    <div className="flex animate-fade-in-up items-start gap-4">
      {Icon && (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-maroon/10 shadow-sm dark:bg-maroon/20">
          <Icon className={cn("h-6 w-6", iconClassName ?? "text-maroon")} aria-hidden />
        </div>
      )}
      <div className="min-w-0 pt-0.5">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-[28px] dark:text-gray-100">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-gray-600 dark:text-gray-400">{description}</p>}
      </div>
    </div>
  );
}
