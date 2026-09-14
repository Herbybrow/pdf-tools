"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { renderPdfThumbnails } from "@/lib/pdfThumbnails";
import { compressToRangeSpec, parsePageListSpec, parseRangeGroups } from "@/lib/pageSelection";

type PagePickerFieldProps = {
  file: File;
  value: string;
  onChange: (value: string) => void;
  mode: "select" | "ranges";
  label: string;
};

/** Visual, click-to-pick replacement for a blind "type page numbers" text field --
 * renders every page as a thumbnail so choosing which pages to extract/remove/split
 * doesn't require opening the PDF elsewhere first to know what's even on each page.
 * "select" mode (Extract/Remove pages): click toggles a page in or out of one flat spec.
 * "ranges" mode (Split PDF): click stages pages into a draft group; "Add range" commits
 * the draft as one more semicolon-separated output-file group, mirroring iLovePDF's
 * Range 1 / Range 2 / ... builder. Either way, the underlying value is still the exact
 * same plain-text spec the backend already parses -- no backend changes needed. */
export default function PagePickerField({ file, value, onChange, mode, label }: PagePickerFieldProps) {
  const { t } = useLanguage();
  const [thumbnails, setThumbnails] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Set<number>>(new Set());

  // The caller keys this component on the file's identity (see ToolOptionsForm), so a
  // new file remounts with fresh initial state instead of needing a reset here.
  useEffect(() => {
    let cancelled = false;
    renderPdfThumbnails(file, 0.3)
      .then((thumbs) => {
        if (!cancelled) setThumbnails(thumbs);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (failed) {
    return <p className="text-xs text-red-600 dark:text-red-400">{t("pagePicker.loadFailed")}</p>;
  }

  if (!thumbnails) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-xs text-gray-500 dark:border-slate-600 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("pagePicker.loadingPages")}
      </div>
    );
  }

  const pageCount = thumbnails.length;
  const selected = mode === "select" ? parsePageListSpec(value, pageCount) : draft;
  const groups = mode === "ranges" ? parseRangeGroups(value) : [];

  const togglePage = (index: number) => {
    if (mode === "select") {
      const next = new Set(selected);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      onChange(compressToRangeSpec(next));
    } else {
      setDraft((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
    }
  };

  const selectAll = () => onChange(compressToRangeSpec(Array.from({ length: pageCount }, (_, i) => i)));
  const clearAll = () => onChange("");

  const addRange = () => {
    if (draft.size === 0) return;
    const spec = compressToRangeSpec(draft);
    onChange([...groups, spec].join(";"));
    setDraft(new Set());
  };

  const removeGroup = (groupIndex: number) => {
    onChange(groups.filter((_, i) => i !== groupIndex).join(";"));
  };

  return (
    <div className="sm:col-span-2">
      <div className="mb-2 flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</label>
        {mode === "select" && (
          <div className="flex gap-3 text-xs font-medium">
            <button type="button" onClick={selectAll} className="text-maroon hover:underline">
              {t("pagePicker.selectAll")}
            </button>
            <button type="button" onClick={clearAll} className="text-gray-500 hover:underline dark:text-gray-400">
              {t("pagePicker.clear")}
            </button>
          </div>
        )}
      </div>

      {mode === "ranges" && groups.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {groups.map((group, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 rounded-full bg-maroon/10 px-3 py-1 text-xs font-semibold text-maroon dark:bg-maroon/20"
            >
              {t("pagePicker.range")} {i + 1}: {group}
              <button type="button" onClick={() => removeGroup(i)} aria-label={t("pagePicker.removeRange")}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        data-testid="page-picker-grid"
        className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-6"
      >
        {thumbnails.map((src, index) => {
          const isSelected = selected.has(index);
          return (
            <button
              key={index}
              type="button"
              onClick={() => togglePage(index)}
              className={`group relative overflow-hidden rounded-md border-2 bg-white transition-colors dark:bg-slate-800 ${
                isSelected ? (mode === "ranges" ? "border-gold" : "border-maroon") : "border-transparent hover:border-gray-300 dark:hover:border-slate-600"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL thumbnail */}
              <img src={src} alt={`Page ${index + 1}`} className="w-full" />
              {isSelected && (
                <span
                  className={`absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-white ${
                    mode === "ranges" ? "bg-gold" : "bg-maroon"
                  }`}
                >
                  <Check className="h-3 w-3" />
                </span>
              )}
              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/50 px-1 text-[10px] leading-tight text-white">
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        {mode === "select" ? (
          <span>
            {selected.size} {t("pagePicker.of")} {pageCount} {t("pagePicker.pagesSelected")}
          </span>
        ) : (
          <span>
            {draft.size > 0
              ? `${draft.size} ${t("pagePicker.pagesStaged")}`
              : t("pagePicker.clickPagesHint")}
          </span>
        )}
        {mode === "ranges" && (
          <button
            type="button"
            onClick={addRange}
            disabled={draft.size === 0}
            className="rounded-lg bg-maroon px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("pagePicker.addRange")}
          </button>
        )}
      </div>
    </div>
  );
}
