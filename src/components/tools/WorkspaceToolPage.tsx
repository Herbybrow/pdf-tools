"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, FileText, Loader2, X } from "lucide-react";
import { getCatalogTools } from "@/components/header";
import type { ToolDefinition } from "@/lib/toolDefinitions";
import { triggerDownload } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { fetchOfficePreviewPdf, resultPreviewEndpointFor, sourcePreviewEndpointFor } from "@/lib/officePreview";
import { isPreviewableBlob } from "@/lib/previewable";
import { useToolSubmission } from "@/lib/useToolSubmission";
import FileDropzone from "./FileDropzone";
import ToolOptionsForm from "./ToolOptionsForm";
import ToolPageHeader from "./ToolPageHeader";
import ToolResultPanel from "./ToolResultPanel";

// Dynamic imports to strip heavy PDF/canvas engines and modals from initial page load
const DocumentPreview = dynamic(() => import("./DocumentPreview"), { ssr: false });
const PasswordPromptModal = dynamic(() => import("./PasswordPromptModal"), { ssr: false });
const PreviewModal = dynamic(() => import("./PreviewModal"), { ssr: false });
const WatermarkPreviewOverlay = dynamic(() => import("./WatermarkPreviewOverlay"), { ssr: false });

type WorkspaceToolPageProps = {
  definition: ToolDefinition;
  title: string;
  titleSw?: string;
  description?: string;
  descriptionSw?: string;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function isPreviewableFile(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

export default function WorkspaceToolPage({ definition, title, titleSw, description, descriptionSw }: WorkspaceToolPageProps) {
  const { t, language } = useLanguage();
  const isSw = language === "sw";
  const displayTitle = (isSw && titleSw) || title;
  const displayDescription = (isSw && descriptionSw) || description;
  const displaySubmitLabel = (isSw && definition.submitLabelSw) || definition.submitLabel;
  const displayHelperNote = (isSw && definition.helperNoteSw) || definition.helperNote;
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${definition.slug}`);

  const {
    files,
    setFiles,
    secondaryFile,
    setSecondaryFile,
    values,
    handleChange,
    secondaryFileVisible,
    canSubmit,
    status,
    error,
    result,
    passwordPrompt,
    setPasswordPrompt,
    reset: resetSubmission,
    processAnother: processAnotherSubmission,
    submitWith,
    submitFromCache,
  } = useToolSubmission(definition);

  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const primaryFile = files[0] ?? null;

  const [sourcePreview, setSourcePreview] = useState<{ file: File; pdf: Blob | null } | null>(null);
  const [resultPreview, setResultPreview] = useState<{ result: typeof result; pdf: Blob | null } | null>(null);

  const sourcePreviewEndpoint = primaryFile && !isPreviewableFile(primaryFile) ? sourcePreviewEndpointFor(definition.slug) : null;
  const sourcePreviewPdf = sourcePreview?.file === primaryFile ? sourcePreview.pdf : null;
  const sourcePreviewLoading = !!sourcePreviewEndpoint && sourcePreview?.file !== primaryFile;

  useEffect(() => {
    if (!sourcePreviewEndpoint || !primaryFile) return;
    let cancelled = false;
    fetchOfficePreviewPdf(sourcePreviewEndpoint, primaryFile, primaryFile.name).then((pdf) => {
      if (!cancelled) setSourcePreview({ file: primaryFile, pdf });
    });
    return () => {
      cancelled = true;
    };
  }, [sourcePreviewEndpoint, primaryFile]);

  const resultPreviewEndpoint = result && !isPreviewableBlob(result.blob) ? resultPreviewEndpointFor(result.blob.type) : null;
  const resultPreviewPdf = resultPreview?.result === result ? resultPreview.pdf : null;
  const resultPreviewLoading = !!resultPreviewEndpoint && resultPreview?.result !== result;

  useEffect(() => {
    if (!resultPreviewEndpoint || !result) return;
    let cancelled = false;
    fetchOfficePreviewPdf(resultPreviewEndpoint, result.blob, result.filename).then((pdf) => {
      if (!cancelled) setResultPreview({ result, pdf });
    });
    return () => {
      cancelled = true;
    };
  }, [resultPreviewEndpoint, result]);

  const previewSource = useMemo<Blob | File | null>(() => {
    if (result) return isPreviewableBlob(result.blob) ? result.blob : resultPreviewPdf;
    if (primaryFile) return isPreviewableFile(primaryFile) ? primaryFile : sourcePreviewPdf;
    return null;
  }, [result, primaryFile, sourcePreviewPdf, resultPreviewPdf]);

  const reset = () => {
    resetSubmission();
    setFullscreenOpen(false);
  };
  const processAnother = () => {
    processAnotherSubmission();
    setFullscreenOpen(false);
  };

  const sizeReductionPercent =
    status === "success" && result && primaryFile && result.blob.size < primaryFile.size
      ? Math.round((1 - result.blob.size / primaryFile.size) * 100)
      : null;

  if (!primaryFile) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={displayTitle} description={displayDescription} />
        <div className="mx-auto mt-8 max-w-2xl">
          <FileDropzone accept={definition.accept} multiple={definition.multiple} files={files} onChange={setFiles} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={displayTitle} description={displayDescription} />

      <div className="mt-6 flex flex-col items-start gap-6 lg:flex-row">
        <div className="relative flex h-130 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 lg:h-160">
          {previewSource ? (
            <>
              <DocumentPreview blob={previewSource} variant="inline" />
              {definition.slug === "add-watermark" && status === "idle" && (
                <WatermarkPreviewOverlay values={values} imageFile={secondaryFile[0] ?? null} />
              )}
            </>
          ) : status === "loading" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
              <Loader2 className="h-10 w-10 animate-spin text-maroon" aria-hidden />
              <p className="max-w-xs text-sm">{t("workspace.converting")}</p>
            </div>
          ) : resultPreviewLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
              <Loader2 className="h-10 w-10 animate-spin text-maroon" aria-hidden />
              <p className="max-w-xs text-sm">{t("workspace.generatingPreview")}</p>
            </div>
          ) : status === "success" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
              <p className="max-w-xs text-sm">{t("workspace.doneNotPreviewable")}</p>
            </div>
          ) : sourcePreviewLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
              <Loader2 className="h-10 w-10 animate-spin text-maroon" aria-hidden />
              <p className="max-w-xs text-sm">{t("workspace.generatingPreview")}</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
              <FileText className="h-12 w-12" aria-hidden />
              <p className="max-w-xs text-sm">
                {t("workspace.notPreviewableYet").replace("{action}", displaySubmitLabel ?? t("workspace.runIt"))}
              </p>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-6 lg:w-95 lg:shrink-0">
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-maroon/10 text-maroon">
                <FileText className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{primaryFile.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(primaryFile.size)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={processAnother}
              aria-label={t("workspace.removeFile")}
              title={t("workspace.removeFile")}
              className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-red-600 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {status === "idle" ? (
            <>
              {displayHelperNote && (
                <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">{displayHelperNote}</p>
              )}
              {secondaryFileVisible && definition.secondaryFile && (
                <FileDropzone
                  accept={definition.secondaryFile.accept}
                  multiple={false}
                  files={secondaryFile}
                  onChange={setSecondaryFile}
                  label={(isSw && definition.secondaryFile.labelSw) || definition.secondaryFile.label}
                />
              )}
              <ToolOptionsForm fields={definition.fields} values={values} onChange={handleChange} file={primaryFile} />
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => (sourcePreviewEndpoint && sourcePreviewPdf ? submitFromCache(sourcePreviewPdf, definition.resultFilename) : submitWith())}
                className="w-full rounded-xl bg-maroon px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-maroon/20 transition-all hover:bg-maroon/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {displaySubmitLabel ?? "Run"}
              </button>
            </>
          ) : (
            <>
              {sizeReductionPercent !== null && sizeReductionPercent > 0 && primaryFile && result && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3">
                  <span className="rounded-full bg-maroon px-2.5 py-1 text-xs font-bold text-white">
                    {t("workspace.saved")} {sizeReductionPercent}%
                  </span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {formatBytes(primaryFile.size)} → {formatBytes(result.blob.size)}
                  </span>
                </div>
              )}
              <ToolResultPanel
                status={status}
                error={error}
                resultFilename={result?.filename}
                onDownload={result ? () => triggerDownload(result.blob, result.filename) : undefined}
                onPreview={result && (isPreviewableBlob(result.blob) || resultPreviewPdf) ? () => setFullscreenOpen(true) : undefined}
                onReset={reset}
                onProcessAnother={processAnother}
              />
            </>
          )}
        </div>
      </div>

      {passwordPrompt && (
        <PasswordPromptModal
          wrongPassword={passwordPrompt.wrongPassword}
          onCancel={() => setPasswordPrompt(null)}
          onSubmit={(password) => submitWith(password)}
        />
      )}

      {fullscreenOpen && result && (
        <PreviewModal
          blob={isPreviewableBlob(result.blob) ? result.blob : (resultPreviewPdf ?? result.blob)}
          filename={result.filename}
          onClose={() => setFullscreenOpen(false)}
        />
      )}
    </main>
  );
}