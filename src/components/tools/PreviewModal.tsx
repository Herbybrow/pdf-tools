"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import DocumentPreview from "./DocumentPreview";

type PreviewModalProps = {
  blob: Blob;
  filename: string;
  onClose: () => void;
};

export default function PreviewModal({ blob, filename, onClose }: PreviewModalProps) {
  const { t } = useLanguage();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-8">
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-700">
          <p className="truncate pr-4 text-sm font-medium text-gray-900 dark:text-gray-100">{filename}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 bg-gray-100 dark:bg-slate-900">
          <DocumentPreview blob={blob} variant="modal" />
        </div>
      </div>
    </div>
  );
}
