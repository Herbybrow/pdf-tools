"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, X } from "lucide-react";
import { getCatalogTools } from "@/components/header";
import type { ToolDefinition } from "@/lib/toolDefinitions";
import { triggerDownload } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { fetchOfficePreviewPdf, resultPreviewEndpointFor, sourcePreviewEndpointFor } from "@/lib/officePreview";
import { isPreviewableBlob } from "@/lib/previewable";
import { useToolSubmission } from "@/lib/useToolSubmission";
import DocumentPreview from "./DocumentPreview";
import FileDropzone from "./FileDropzone";
import PasswordPromptModal from "./PasswordPromptModal";
import PreviewModal from "./PreviewModal";
import ToolOptionsForm from "./ToolOptionsForm";
import ToolPageHeader from "./ToolPageHeader";
import ToolResultPanel from "./ToolResultPanel";
import WatermarkPreviewOverlay from "./WatermarkPreviewOverlay";

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

/** Side-by-side "workspace" layout, piloted on a few tools before wider rollout:
 * a live document preview on the left, file info + options + actions on the right.
 * The preview automatically switches from the source file to the processed output
 * the moment it's ready, without navigating away or clearing the workspace. Built on
 * the same useToolSubmission hook as GenericToolPage, so behavior (password retry,
 * encrypted-PDF handling, reset semantics) is identical -- only the layout differs. */
export default function WorkspaceToolPage({ definition, title, titleSw, description, descriptionSw }: WorkspaceToolPageProps) {
  const { t, language } = useLanguage();
  const isSw = language === "sw";
  const displayTitle = (isSw && titleSw) || title;
  const displayDescription = (isSw && descriptionSw) || description;
  const displaySubmitLabel = (isSw && definition.submitLabelSw) || definition.submitLabel;
  const displayHelperNote = (isSw && definition.helperNoteSw) || definition.helperNote;
  // Looked up client-side rather than passed down from the (server) [slug]/page.tsx --
  // a Lucide icon is a component reference, which can't cross the server->client props
  // boundary, only plain serializable data can.
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

  // Word/PowerPoint/Excel files can't be rendered by pdf.js -- the only genuine preview
  // for one is running it through the same LibreOffice conversion the real tool uses.
  // These hold that rendered-for-preview PDF, tagged with the exact file/result it was
  // generated for, separate from the main submission's `result`: a source-side preview
  // (before the real conversion even runs) for tools like Word to PDF, and a result-side
  // preview (after it runs) for tools like PDF to Word, whose *output* is the Office file
  // that needs the same detour. Tagging (rather than clearing to null when the file/result
  // changes) means the effects below only ever setState from their async callback, never
  // synchronously in the effect body -- stale data is dropped by the read side simply not
  // matching the tag, not by an eager reset racing the fetch it's supposed to precede.
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

  // Preference order: the real result if the browser can show it directly, else that
  // result rendered through the Office->PDF detour above; the source file if the browser
  // can show it directly, else the source rendered through that same detour; otherwise
  // nothing yet. Derived via useMemo (not a state+effect pair) so it's available
  // synchronously on the same render as any of these change.
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

  // Only meaningful when the output is genuinely smaller (Compress PDF's whole point) --
  // for tools where size isn't the point (Protect PDF's encryption overhead, a format
  // conversion), the output may be the same size or larger, so this just doesn't show.
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
            // Genuinely in progress -- a spinner here (not just in the right-hand panel)
            // means there's visible feedback in the one place someone's eyes are already
            // on, instead of a static box that looks identical to "nothing is happening."
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
              <Loader2 className="h-10 w-10 animate-spin text-maroon" aria-hidden />
              <p className="max-w-xs text-sm">{t("workspace.converting")}</p>
            </div>
          ) : resultPreviewLoading ? (
            // Output format the browser can't render directly (e.g. PDF to Word's .docx)
            // -- running it back through LibreOffice to get something genuinely
            // previewable, not just declaring it unpreviewable and stopping there.
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
              <Loader2 className="h-10 w-10 animate-spin text-maroon" aria-hidden />
              <p className="max-w-xs text-sm">{t("workspace.generatingPreview")}</p>
            </div>
          ) : status === "success" ? (
            // The preview conversion above genuinely failed (a rare, real fallback -- not
            // the common case, since resultPreviewLoading handles the normal path).
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
              <p className="max-w-xs text-sm">{t("workspace.doneNotPreviewable")}</p>
            </div>
          ) : sourcePreviewLoading ? (
            // Source format the browser can't render directly (e.g. Word to PDF's .docx)
            // -- same detour as above, run before the real conversion even starts.
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
              <Loader2 className="h-10 w-10 animate-spin text-maroon" aria-hidden />
              <p className="max-w-xs text-sm">{t("workspace.generatingPreview")}</p>
            </div>
          ) : (
            // That preview conversion genuinely failed, or this source type has no
            // Office->PDF detour available at all -- expected for some file types, not
            // broken, so say so and point at the actual next step.
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
                // The auto-generated source preview (above) already ran this exact file
                // through this exact LibreOffice conversion to produce something to show
                // before the user ever clicked anything -- when it's ready, reuse those
                // same bytes as the real result instead of paying the same 15+ second
                // conversion cost again for output that would be identical.
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
