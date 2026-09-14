"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type ToolResultPanelProps = {
  status: "loading" | "error" | "success";
  error?: string;
  resultFilename?: string;
  onDownload?: () => void;
  onPreview?: () => void;
  /** Error state's "try again" — keeps the selected file(s) and options intact. */
  onReset: () => void;
  /** Success state's "process another" — clears the selected file(s) and options too,
   * so the form is genuinely blank rather than still showing the just-converted file.
   * Falls back to onReset if not provided. */
  onProcessAnother?: () => void;
};

export default function ToolResultPanel({
  status,
  error,
  resultFilename,
  onDownload,
  onPreview,
  onReset,
  onProcessAnother,
}: ToolResultPanelProps) {
  const { t } = useLanguage();

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-4 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300">
        <Loader2 className="h-5 w-5 animate-spin text-maroon" />
        {t("result.processing")}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">{t("result.errorTitle")}</p>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={onReset}
            className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            {t("result.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-medium">
          {t("result.done")}
          {resultFilename ? `: ${resultFilename}` : ""}
        </p>
        <div className="mt-3 flex gap-2">
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="rounded-lg bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon/90"
            >
              {t("result.download")}
            </button>
          )}
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              {t("result.preview")}
            </button>
          )}
          <button
            type="button"
            onClick={onProcessAnother ?? onReset}
            className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            {t("result.processAnother")}
          </button>
        </div>
      </div>
    </div>
  );
}
