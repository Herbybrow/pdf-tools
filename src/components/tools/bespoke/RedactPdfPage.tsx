"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { getCatalogTools } from "@/components/header";
import ToolPageHeader from "@/components/tools/ToolPageHeader";
import FileDropzone from "@/components/tools/FileDropzone";
import PasswordPromptModal from "@/components/tools/PasswordPromptModal";
import PreviewModal from "@/components/tools/PreviewModal";
import ToolResultPanel from "@/components/tools/ToolResultPanel";
import { ApiError, EncryptedPdfRequiredError, postForFile, triggerDownload } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isPreviewableBlob } from "@/lib/previewable";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type Region = { id: string; page: number; x: number; y: number; width: number; height: number };
type Status = "idle" | "loading" | "error" | "success";
type DrawState = { page: number; startX: number; startY: number } | null;

export default function RedactPdfPage({ slug }: { slug: string }) {
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${slug}`);
  const { t } = useLanguage();
  const [file, setFile] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [pageScale, setPageScale] = useState<number[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [livePreview, setLivePreview] = useState<Region | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filePassword, setFilePassword] = useState<string | undefined>(undefined);
  const [passwordPrompt, setPasswordPrompt] = useState<{ wrongPassword: boolean } | null>(null);
  const drawState = useRef<DrawState>(null);

  const loadFile = async (files: File[], password?: string) => {
    setFile(files);
    const picked = files[0];
    if (!picked) return;
    setLoading(true);
    try {
      const buffer = await picked.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buffer, password });
      const doc = await loadingTask.promise;
      const images: string[] = [];
      const sizes: { width: number; height: number }[] = [];
      const scales: number[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1.3 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        images.push(canvas.toDataURL("image/png"));
        sizes.push({ width: viewport.width, height: viewport.height });
        scales.push(viewport.width / page.view[2]);
        page.cleanup();
      }
      await loadingTask.destroy();
      setPageImages(images);
      setPageSizes(sizes);
      setPageScale(scales);
      setRegions([]);
      if (password) setFilePassword(password);
    } catch (err) {
      if (err instanceof pdfjsLib.PasswordException) {
        setPasswordPrompt({ wrongPassword: err.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD });
        return;
      }
      setError(t("common.couldNotReadPdf"));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (password: string) => {
    setPasswordPrompt(null);
    void loadFile(file, password);
  };

  const handleMouseDown = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    drawState.current = { page: pageIndex, startX: e.clientX - rect.left, startY: e.clientY - rect.top };
  };

  const handleMouseMove = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawState.current || drawState.current.page !== pageIndex) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { startX, startY } = drawState.current;
    setLivePreview({
      id: "preview",
      page: pageIndex,
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      width: Math.abs(x - startX),
      height: Math.abs(y - startY),
    });
  };

  const handleMouseUp = () => {
    if (livePreview && livePreview.width > 4 && livePreview.height > 4) {
      setRegions((prev) => [...prev, { ...livePreview, id: crypto.randomUUID() }]);
    }
    drawState.current = null;
    setLivePreview(null);
  };

  const removeRegion = (id: string) => setRegions((prev) => prev.filter((r) => r.id !== id));

  const reset = () => {
    setStatus("idle");
    setError("");
    setResult(null);
    setPreviewOpen(false);
  };

  const processAnother = () => {
    reset();
    setFile([]);
    setPageImages([]);
    setPageSizes([]);
    setPageScale([]);
    setRegions([]);
    setLivePreview(null);
    setFilePassword(undefined);
  };

  const handleSubmit = async () => {
    if (!file[0] || regions.length === 0) return;
    setStatus("loading");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file[0]);
      const payload = regions.map((r) => {
        const scale = pageScale[r.page] || 1;
        return {
          page: r.page,
          x0: r.x / scale,
          y0: r.y / scale,
          x1: (r.x + r.width) / scale,
          y1: (r.y + r.height) / scale,
        };
      });
      formData.append("regions", JSON.stringify(payload));
      if (filePassword) formData.append("password", filePassword);
      const { blob, filename } = await postForFile("/api/v1/security/redact", formData, "redacted.pdf");
      setResult({ blob, filename });
      setStatus("success");
    } catch (err) {
      if (err instanceof EncryptedPdfRequiredError) {
        setPasswordPrompt({ wrongPassword: err.wrongPassword });
        setStatus("idle");
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.unexpectedError"));
      setStatus("error");
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10 sm:px-10">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("redact.title")} description={t("redact.description")} />

      {pageImages.length === 0 && (
        <div className="mt-6">
          <FileDropzone accept=".pdf,application/pdf" multiple={false} files={file} onChange={loadFile} />
          {loading && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t("edit.loadingPages")}</p>}
        </div>
      )}

      {pageImages.length > 0 && (
        <>
          <div className="mt-6 space-y-8">
            {pageImages.map((src, pageIndex) => (
              <div key={pageIndex}>
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t("redact.page")} {pageIndex + 1}
                </p>
                <div
                  className="relative cursor-crosshair select-none border border-gray-200 shadow-sm dark:border-slate-700"
                  style={{ width: pageSizes[pageIndex]?.width, height: pageSizes[pageIndex]?.height }}
                  onMouseDown={(e) => handleMouseDown(pageIndex, e)}
                  onMouseMove={(e) => handleMouseMove(pageIndex, e)}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => (drawState.current = null)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamically rendered PDF page */}
                  <img src={src} alt={`Page ${pageIndex + 1}`} className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
                  <svg className="pointer-events-none absolute inset-0 h-full w-full">
                    {regions
                      .filter((r) => r.page === pageIndex)
                      .map((r) => (
                        <rect key={r.id} x={r.x} y={r.y} width={r.width} height={r.height} fill="black" fillOpacity={0.85} />
                      ))}
                    {livePreview?.page === pageIndex && (
                      <rect x={livePreview.x} y={livePreview.y} width={livePreview.width} height={livePreview.height} fill="black" fillOpacity={0.4} />
                    )}
                  </svg>
                </div>
              </div>
            ))}
          </div>

          {regions.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {t("redact.regionsHeading")} ({regions.length})
              </h2>
              <ul className="mt-2 space-y-1">
                {regions.map((r, i) => (
                  <li key={r.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 dark:border-slate-700 dark:text-gray-300">
                    <span>
                      {t("redact.region")} {i + 1} — {t("redact.page").toLowerCase()} {r.page + 1}
                    </span>
                    <button type="button" onClick={() => removeRegion(r.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6">
            {status === "idle" && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={regions.length === 0}
                className="rounded-lg bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("redact.applyButton")}
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
