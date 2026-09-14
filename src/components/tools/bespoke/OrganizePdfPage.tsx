"use client";

import { useCallback, useRef, useState } from "react";
import { GripVertical, Plus, RotateCw, Trash2 } from "lucide-react";
import { getCatalogTools } from "@/components/header";
import ToolPageHeader from "@/components/tools/ToolPageHeader";
import FileDropzone from "@/components/tools/FileDropzone";
import PasswordPromptModal from "@/components/tools/PasswordPromptModal";
import PreviewModal from "@/components/tools/PreviewModal";
import ToolResultPanel from "@/components/tools/ToolResultPanel";
import { ApiError, EncryptedPdfRequiredError, postForFile, triggerDownload } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PdfPasswordRequiredError, renderPdfThumbnails } from "@/lib/pdfThumbnails";
import { isPreviewableBlob } from "@/lib/previewable";

type PageRef = {
  id: string;
  source: "primary" | "secondary";
  pageIndex: number;
  rotation: number;
  thumbnail: string;
};

type Status = "idle" | "loading" | "error" | "success";

export default function OrganizePdfPage({ slug }: { slug: string }) {
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${slug}`);
  const { t } = useLanguage();
  const [primaryFile, setPrimaryFile] = useState<File[]>([]);
  const [secondaryFile, setSecondaryFile] = useState<File[]>([]);
  const [showInsert, setShowInsert] = useState(false);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filePassword, setFilePassword] = useState<string | undefined>(undefined);
  const [passwordPrompt, setPasswordPrompt] = useState<{ target: "primary" | "secondary"; wrongPassword: boolean } | null>(null);
  const dragIndex = useRef<number | null>(null);

  const loadPrimary = useCallback(async (files: File[], password?: string) => {
    setPrimaryFile(files);
    const file = files[0];
    if (!file) {
      setPages([]);
      return;
    }
    setLoadingThumbnails(true);
    try {
      const thumbs = await renderPdfThumbnails(file, 0.55, password);
      setPages(
        thumbs.map((thumbnail, index) => ({
          id: `primary-${index}`,
          source: "primary" as const,
          pageIndex: index,
          rotation: 0,
          thumbnail,
        })),
      );
      if (password) setFilePassword(password);
    } catch (err) {
      if (err instanceof PdfPasswordRequiredError) {
        setPasswordPrompt({ target: "primary", wrongPassword: err.wrongPassword });
        return;
      }
      setError(t("organize.couldNotRead"));
    } finally {
      setLoadingThumbnails(false);
    }
  }, [t]);

  const loadSecondary = useCallback(
    async (files: File[], password?: string) => {
      setSecondaryFile(files);
      const file = files[0];
      if (!file) return;
      setLoadingThumbnails(true);
      try {
        const thumbs = await renderPdfThumbnails(file, 0.55, password ?? filePassword);
        setPages((prev) => [
          ...prev,
          ...thumbs.map((thumbnail, index) => ({
            id: `secondary-${index}`,
            source: "secondary" as const,
            pageIndex: index,
            rotation: 0,
            thumbnail,
          })),
        ]);
        if (password) setFilePassword(password);
      } catch (err) {
        if (err instanceof PdfPasswordRequiredError) {
          setPasswordPrompt({ target: "secondary", wrongPassword: err.wrongPassword });
          return;
        }
        setError(t("organize.couldNotRead"));
      } finally {
        setLoadingThumbnails(false);
      }
    },
    [filePassword, t],
  );

  const handlePasswordSubmit = (password: string) => {
    const target = passwordPrompt?.target;
    setPasswordPrompt(null);
    if (target === "primary") void loadPrimary(primaryFile, password);
    else if (target === "secondary") void loadSecondary(secondaryFile, password);
  };

  const rotate = (id: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p)));
  };

  const remove = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  };

  const handleDrop = (targetIndex: number) => {
    const from = dragIndex.current;
    if (from === null || from === targetIndex) return;
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    dragIndex.current = null;
  };

  const reset = () => {
    setStatus("idle");
    setError("");
    setResult(null);
    setPreviewOpen(false);
  };

  const startOver = () => {
    setPrimaryFile([]);
    setSecondaryFile([]);
    setShowInsert(false);
    setPages([]);
    reset();
  };

  const handleSubmit = async () => {
    if (pages.length === 0 || !primaryFile[0]) return;
    setStatus("loading");
    setError("");
    try {
      const formData = new FormData();
      formData.append("files", primaryFile[0]);
      if (secondaryFile[0]) formData.append("files", secondaryFile[0]);
      const sourceIndex: Record<PageRef["source"], number> = { primary: 0, secondary: 1 };
      const layout = pages.map((p) => ({ source: sourceIndex[p.source], page: p.pageIndex, rotation: p.rotation }));
      formData.append("layout", JSON.stringify(layout));
      if (filePassword) formData.append("password", filePassword);
      const { blob, filename } = await postForFile("/api/v1/organize/compose", formData, "organized.pdf");
      setResult({ blob, filename });
      setStatus("success");
    } catch (err) {
      if (err instanceof EncryptedPdfRequiredError) {
        setPasswordPrompt({ target: "primary", wrongPassword: err.wrongPassword });
        setStatus("idle");
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.unexpectedError"));
      setStatus("error");
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("organize.title")} description={t("organize.description")} />

      {pages.length === 0 && (
        <div className="mt-6">
          <FileDropzone accept=".pdf,application/pdf" multiple={false} files={primaryFile} onChange={loadPrimary} />
        </div>
      )}

      {loadingThumbnails && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t("organize.renderingPreviews")}</p>}

      {pages.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
            {pages.map((page, index) => (
              <div
                key={page.id}
                draggable
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                className="group relative rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="absolute left-2 top-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">{index + 1}</div>
                <GripVertical className="absolute right-2 top-2 z-10 h-4 w-4 cursor-grab text-gray-400" />
                {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated canvas data URLs, not a static asset */}
                <img
                  src={page.thumbnail}
                  alt={`Page ${index + 1}`}
                  style={{ transform: `rotate(${page.rotation}deg)` }}
                  className="mx-auto h-40 w-auto rounded border border-gray-100 object-contain transition-transform dark:border-slate-600"
                />
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => rotate(page.id)}
                    className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"
                    aria-label="Rotate page"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(page.id)}
                    className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    aria-label="Delete page"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {!showInsert && (
              <button
                type="button"
                onClick={() => setShowInsert(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" /> {t("organize.insertPages")}
              </button>
            )}
            <button
              type="button"
              onClick={startOver}
              className="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {t("organize.startOver")}
            </button>
          </div>

          {showInsert && (
            <div className="mt-4 max-w-md">
              <FileDropzone
                accept=".pdf,application/pdf"
                multiple={false}
                files={secondaryFile}
                onChange={loadSecondary}
                label={t("organize.insertDropLabel")}
              />
            </div>
          )}

          <div className="mt-8">
            {status === "idle" && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pages.length === 0}
                className="rounded-lg bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("organize.saveButton")}
              </button>
            )}
            {status !== "idle" && (
              <ToolResultPanel
                status={status}
                error={error}
                resultFilename={result?.filename}
                onDownload={result ? () => triggerDownload(result.blob, result.filename) : undefined}
                onPreview={result && isPreviewableBlob(result.blob) ? () => setPreviewOpen(true) : undefined}
                onReset={reset}
                onProcessAnother={startOver}
              />
            )}
          </div>
        </>
      )}

      {passwordPrompt && (
        <PasswordPromptModal
          wrongPassword={passwordPrompt.wrongPassword}
          onCancel={() => setPasswordPrompt(null)}
          onSubmit={handlePasswordSubmit}
        />
      )}

      {previewOpen && result && (
        <PreviewModal blob={result.blob} filename={result.filename} onClose={() => setPreviewOpen(false)} />
      )}
    </main>
  );
}
