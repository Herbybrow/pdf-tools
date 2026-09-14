"use client";

import { useRef, useState } from "react";
import { GripVertical, RotateCw, Trash2 } from "lucide-react";
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

type SourceFile = { id: string; file: File };
type PageRef = { id: string; fileId: string; pageIndex: number; rotation: number; thumbnail: string };
type Status = "idle" | "loading" | "error" | "success";

function newId() {
  return crypto.randomUUID();
}

export default function MergePdfPage({ slug }: { slug: string }) {
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${slug}`);
  const { t } = useLanguage();
  const [files, setFiles] = useState<File[]>([]);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [lastPassword, setLastPassword] = useState<string | undefined>(undefined);
  const [passwordPrompt, setPasswordPrompt] = useState<{ fileId: string; file: File; wrongPassword: boolean } | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const loadThumbnailsFor = async (fileId: string, file: File, password?: string) => {
    setLoadingThumbnails(true);
    try {
      const thumbs = await renderPdfThumbnails(file, 0.55, password ?? lastPassword);
      setPages((prev) => [
        ...prev,
        ...thumbs.map((thumbnail, index) => ({ id: `${fileId}-${index}`, fileId, pageIndex: index, rotation: 0, thumbnail })),
      ]);
      if (password) setLastPassword(password);
    } catch (err) {
      if (err instanceof PdfPasswordRequiredError) {
        setPasswordPrompt({ fileId, file, wrongPassword: err.wrongPassword });
        return;
      }
      setError(t("merge.couldNotRead"));
      // Drop the file we couldn't read at all so it doesn't linger as a dead entry.
      setSourceFiles((prev) => prev.filter((sf) => sf.id !== fileId));
      setFiles((prev) => prev.filter((f) => f !== file));
    } finally {
      setLoadingThumbnails(false);
    }
  };

  const handleFilesChange = (newFiles: File[]) => {
    const stillPresent = sourceFiles.filter((sf) => newFiles.includes(sf.file));
    const removedIds = new Set(sourceFiles.filter((sf) => !newFiles.includes(sf.file)).map((sf) => sf.id));
    const existingFileObjs = new Set(sourceFiles.map((sf) => sf.file));
    const addedFiles = newFiles.filter((f) => !existingFileObjs.has(f));

    setFiles(newFiles);
    if (removedIds.size > 0) {
      setPages((prev) => prev.filter((p) => !removedIds.has(p.fileId)));
    }

    const added: SourceFile[] = addedFiles.map((file) => ({ id: newId(), file }));
    setSourceFiles([...stillPresent, ...added]);
    // Sequential, not Promise.all/fire-and-forget: rendering time varies with page count,
    // so firing every file's thumbnails in parallel and appending on each one's own
    // resolution reorders pages by whichever file happened to render fastest, not by the
    // order the user added them. Awaiting one at a time keeps the append order predictable.
    void (async () => {
      for (const sf of added) {
        await loadThumbnailsFor(sf.id, sf.file);
      }
    })();
  };

  const handlePasswordSubmit = (password: string) => {
    const target = passwordPrompt;
    setPasswordPrompt(null);
    if (target) void loadThumbnailsFor(target.fileId, target.file, password);
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

  const processAnother = () => {
    reset();
    setFiles([]);
    setSourceFiles([]);
    setPages([]);
    setLastPassword(undefined);
  };

  const handleSubmit = async () => {
    if (pages.length === 0 || sourceFiles.length < 2) return;
    setStatus("loading");
    setError("");
    try {
      const formData = new FormData();
      sourceFiles.forEach((sf) => formData.append("files", sf.file));
      const sourceIndex = new Map(sourceFiles.map((sf, index) => [sf.id, index]));
      const layout = pages.map((p) => ({ source: sourceIndex.get(p.fileId), page: p.pageIndex, rotation: p.rotation }));
      formData.append("layout", JSON.stringify(layout));
      if (lastPassword) formData.append("password", lastPassword);
      const { blob, filename } = await postForFile("/api/v1/organize/compose", formData, "merged_document.pdf");
      setResult({ blob, filename });
      setStatus("success");
    } catch (err) {
      if (err instanceof EncryptedPdfRequiredError) {
        setError(t("merge.passwordMismatch"));
        setStatus("error");
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.unexpectedError"));
      setStatus("error");
    }
  };

  const fileNameFor = (fileId: string) => sourceFiles.find((sf) => sf.id === fileId)?.file.name ?? "";

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("merge.title")} description={t("merge.description")} />

      <div className="mt-6">
        <FileDropzone accept=".pdf,application/pdf" multiple files={files} onChange={handleFilesChange} />
      </div>

      {loadingThumbnails && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t("merge.renderingPreviews")}</p>}

      {pages.length > 0 && (
        <>
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">{t("merge.arrangeHint")}</p>
          <div className="mt-3 grid grid-cols-2 gap-5 sm:grid-cols-3">
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
                <p className="mt-1 truncate text-center text-[10px] text-gray-400 dark:text-gray-500" title={fileNameFor(page.fileId)}>
                  {fileNameFor(page.fileId)}
                </p>
                <div className="mt-1 flex items-center justify-center gap-2">
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

          <div className="mt-8">
            {status === "idle" && (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={sourceFiles.length < 2}
                title={sourceFiles.length < 2 ? t("merge.needTwoFiles") : undefined}
                className="rounded-lg bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("merge.saveButton")}
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
                onProcessAnother={processAnother}
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
