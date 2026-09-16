"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { getCatalogTools } from "@/components/header";
import ToolPageHeader from "@/components/tools/ToolPageHeader";
import FileDropzone from "@/components/tools/FileDropzone";
import PasswordPromptModal from "@/components/tools/PasswordPromptModal";
import PreviewModal from "@/components/tools/PreviewModal";
import ToolResultPanel from "@/components/tools/ToolResultPanel";
import { bakeAnnotationsIntoPdf, type Annotation } from "@/lib/canvasAnnotations";
import { ApiError, apiUrl, triggerDownload } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isPreviewableBlob } from "@/lib/previewable";
import { SIGNATURE_FONTS } from "@/lib/signatureFonts";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type Status = "idle" | "loading" | "error" | "success";
type CreatorTab = "draw" | "type" | "upload";
type SavedSignature = { id: string; dataUrl: string };
type PlacedSignature = { id: string; sourceId: string; dataUrl: string; page: number; x: number; y: number; width: number; height: number };
type DragState = { id: string; grabOffsetX: number; grabOffsetY: number; currentPage: number } | null;
type ResizeState = { id: string; startX: number; startWidth: number; aspect: number } | null;

const INK_COLORS = ["#111111", "#dc2626", "#1d4ed8", "#16a34a"];
const PEN_SIZES = [
  { id: "thin", width: 1.5 },
  { id: "medium", width: 2.5 },
  { id: "thick", width: 4 },
] as const;
const DEFAULT_WIDTH = 200;

function newId() {
  return crypto.randomUUID();
}

function DrawTab({ onUse }: { onUse: (dataUrl: string) => void }) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState(INK_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(PEN_SIZES[1].width);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // The canvas's drawing buffer (canvas.width/height, fixed at 480x180 below) and its
    // on-screen CSS size (stretched to fill the panel via w-full) are two different
    // coordinate spaces once the panel is wider than 480px -- without this scale
    // correction, the stroke lands wherever the cursor would be if the canvas were
    // still 480px wide, drifting further from the real cursor position the wider the
    // panel actually is. This is exactly what the user saw.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const point = "touches" in e ? e.touches[0] : e;
    return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    const { x, y } = getPos(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = penWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">{t("sign.draw.instruction")}</p>
      <canvas
        ref={canvasRef}
        width={480}
        height={180}
        className="w-full cursor-crosshair touch-none rounded border border-dashed border-gray-300 bg-white dark:border-slate-600"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{t("sign.draw.color")}</span>
          {INK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-maroon" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{t("sign.draw.penSize")}</span>
          {PEN_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              onClick={() => setPenWidth(size.width)}
              title={t(`sign.draw.penSize.${size.id}` as const)}
              aria-label={t(`sign.draw.penSize.${size.id}` as const)}
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                penWidth === size.width ? "border-maroon bg-maroon/5" : "border-gray-300 dark:border-slate-600"
              }`}
            >
              <span className="rounded-full bg-gray-800 dark:bg-gray-100" style={{ width: size.width * 2, height: size.width * 2 }} />
            </button>
          ))}
        </div>
        <button type="button" onClick={clear} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200">
          {t("sign.draw.clear")}
        </button>
      </div>
      <button
        type="button"
        onClick={() => canvasRef.current && onUse(canvasRef.current.toDataURL("image/png"))}
        className="w-full rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon/90"
      >
        {t("sign.useSignature")}
      </button>
    </div>
  );
}

function TypeTab({ onUse }: { onUse: (dataUrl: string) => void }) {
  const { t } = useLanguage();
  const [typedName, setTypedName] = useState("");
  const [fontId, setFontId] = useState(SIGNATURE_FONTS[0].id);
  const [color, setColor] = useState(INK_COLORS[0]);

  const applyTypedSignature = async () => {
    const name = typedName.trim();
    if (!name) return;
    const font = SIGNATURE_FONTS.find((f) => f.id === fontId) ?? SIGNATURE_FONTS[0];
    await document.fonts.load(`64px ${font.cssFamily}`);

    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = `64px ${font.cssFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    onUse(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={typedName}
        onChange={(e) => setTypedName(e.target.value)}
        placeholder={t("sign.type.placeholder")}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100"
      />
      <div>
        <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">{t("sign.type.chooseStyle")}</p>
        <div className="grid grid-cols-2 gap-2">
          {SIGNATURE_FONTS.map((font) => (
            <button
              type="button"
              key={font.id}
              onClick={() => setFontId(font.id)}
              className={`flex min-h-16 items-center justify-center rounded-lg border px-3 py-2 ${
                fontId === font.id ? "border-maroon bg-maroon/5" : "border-gray-200 dark:border-slate-600"
              }`}
            >
              <span className={font.className} style={{ fontSize: 28, color }}>
                {typedName || font.label}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{t("sign.draw.color")}</span>
        {INK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={c}
            className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-maroon" : "border-transparent"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={!typedName.trim()}
        onClick={() => void applyTypedSignature()}
        className="w-full rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("sign.useSignature")}
      </button>
    </div>
  );
}

function UploadTab({ onUse }: { onUse: (dataUrl: string) => void }) {
  const { t } = useLanguage();
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  // The bespoke dashed-box-plus-hidden-input this replaced only ever supported
  // click-to-browse -- it had no onDrop/onDragOver handlers at all, despite looking
  // exactly like the app's other (genuinely droppable) dropzones. Using the real,
  // shared FileDropzone here gives this tab actual drag-and-drop, not just a fix for a
  // click that silently stopped registering. Reading the file into a preview happens
  // directly from this onChange (the actual user action), not a derived effect.
  const handleFilesChange = (next: File[]) => {
    setFiles(next);
    const chosen = next[0];
    if (!chosen) {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(chosen);
  };

  return (
    <div className="space-y-3">
      <FileDropzone accept="image/png,image/jpeg,image/webp" multiple={false} files={files} onChange={handleFilesChange} label={t("sign.upload.instruction")} />
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t("sign.upload.hint")}</p>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded preview, not a static asset
        <img src={preview} alt="" className="mx-auto max-h-28 rounded border border-gray-200 bg-white object-contain dark:border-slate-600" />
      )}
      <button
        type="button"
        disabled={!preview}
        onClick={() => preview && onUse(preview)}
        className="w-full rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("sign.useSignature")}
      </button>
    </div>
  );
}

export default function SignPdfPage({ slug }: { slug: string }) {
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${slug}`);
  const { t } = useLanguage();
  const [file, setFile] = useState<File[]>([]);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [pageScale, setPageScale] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{ wrongPassword: boolean } | null>(null);

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorTab, setCreatorTab] = useState<CreatorTab>("draw");
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [placedSignatures, setPlacedSignatures] = useState<PlacedSignature[]>([]);
  const [lastUsedPage, setLastUsedPage] = useState(0);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const dragState = useRef<DragState>(null);
  const resizeState = useRef<ResizeState>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const decryptViaBackend = async (picked: File, password: string): Promise<ArrayBuffer> => {
    const formData = new FormData();
    formData.append("file", picked);
    formData.append("password", password);
    const response = await fetch(apiUrl("/api/v1/security/decrypt"), { method: "POST", body: formData });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: "Failed to decrypt PDF." }));
      if (response.status === 422 && body.encrypted) {
        throw { wrongPassword: Boolean(body.wrongPassword) };
      }
      throw new ApiError(body.detail ?? "Failed to decrypt PDF.", response.status);
    }
    return (await response.blob()).arrayBuffer();
  };

  const loadFile = async (files: File[], password?: string) => {
    setFile(files);
    const picked = files[0];
    if (!picked) return;
    setLoading(true);
    try {
      const buffer = password ? await decryptViaBackend(picked, password) : await picked.arrayBuffer();
      setPdfBytes(buffer);
      const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
      const doc = await loadingTask.promise;
      // Rendering every page concurrently instead of one at a time -- pdf.js already
      // decodes off the main thread, so pages mostly wait on each other for no reason
      // when awaited in a loop.
      const rendered = await Promise.all(
        Array.from({ length: doc.numPages }, async (_, index) => {
          const page = await doc.getPage(index + 1);
          const viewport = page.getViewport({ scale: 1.3 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvas, viewport }).promise;
          const image = canvas.toDataURL("image/png");
          const size = { width: viewport.width, height: viewport.height };
          const scale = viewport.width / page.view[2];
          page.cleanup();
          return { image, size, scale };
        }),
      );
      await loadingTask.destroy();
      setPageImages(rendered.map((r) => r.image));
      setPageSizes(rendered.map((r) => r.size));
      setPageScale(rendered.map((r) => r.scale));
    } catch (err) {
      if (err instanceof pdfjsLib.PasswordException) {
        setPasswordPrompt({ wrongPassword: err.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD });
      } else if (err && typeof err === "object" && "wrongPassword" in err) {
        setPasswordPrompt({ wrongPassword: Boolean((err as { wrongPassword: boolean }).wrongPassword) });
      } else {
        setError(t("common.couldNotReadPdf"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (password: string) => {
    setPasswordPrompt(null);
    void loadFile(file, password);
  };

  const placeSignature = (sourceId: string, dataUrl: string) => {
    const pageSize = pageSizes[lastUsedPage] ?? { width: 400, height: 500 };
    const width = Math.min(DEFAULT_WIDTH, pageSize.width * 0.5);
    const height = width * 0.4;
    // Cascade each new placement on the same page a little so it doesn't land exactly
    // on top of one already there (invisible/unreachable until the user notices and
    // drags the top one away) -- each one starts fully visible and independently grabbable.
    const existingOnPage = placedSignatures.filter((s) => s.page === lastUsedPage).length;
    const cascade = (existingOnPage % 5) * 24;
    setPlacedSignatures((prev) => [
      ...prev,
      {
        id: newId(),
        sourceId,
        dataUrl,
        page: lastUsedPage,
        x: (pageSize.width - width) / 2 + cascade,
        y: pageSize.height - height - 60 - cascade,
        width,
        height,
      },
    ]);
  };

  const handleNewSignature = (dataUrl: string) => {
    const sourceId = newId();
    setSavedSignatures((prev) => [...prev, { id: sourceId, dataUrl }]);
    placeSignature(sourceId, dataUrl);
    setCreatorOpen(false);
  };

  const deletePlaced = (id: string) => {
    setPlacedSignatures((prev) => prev.filter((s) => s.id !== id));
  };

  // Drag/resize are tracked via refs and driven by window-level mouse listeners (below)
  // rather than handlers scoped to each page's own <div>. Each page is a separate,
  // gapped element in the vertical stack -- a per-page onMouseLeave would cancel the
  // drag the instant the cursor crossed from one page's box into the gap before the
  // next page, making it impossible to ever drag a signature onto a different page.
  // Listening on window instead means the drag survives crossing page/gap boundaries,
  // and on every move we just re-check which page's rect the cursor is currently over.
  const startDrag = (sig: PlacedSignature, e: React.MouseEvent) => {
    e.stopPropagation();
    const pageEl = pageRefs.current[sig.page];
    if (!pageEl) return;
    const pageRect = pageEl.getBoundingClientRect();
    dragState.current = {
      id: sig.id,
      grabOffsetX: e.clientX - pageRect.left - sig.x,
      grabOffsetY: e.clientY - pageRect.top - sig.y,
      currentPage: sig.page,
    };
  };

  const startResize = (sig: PlacedSignature, e: React.MouseEvent) => {
    e.stopPropagation();
    resizeState.current = { id: sig.id, startX: e.clientX, startWidth: sig.width, aspect: sig.width / sig.height };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragState.current) {
        const drag = dragState.current;
        let targetPage = drag.currentPage;
        for (let i = 0; i < pageRefs.current.length; i++) {
          const rect = pageRefs.current[i]?.getBoundingClientRect();
          if (rect && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            targetPage = i;
            break;
          }
        }
        drag.currentPage = targetPage;
        const pageRect = pageRefs.current[targetPage]?.getBoundingClientRect();
        if (!pageRect) return;
        const newX = e.clientX - pageRect.left - drag.grabOffsetX;
        const newY = e.clientY - pageRect.top - drag.grabOffsetY;
        setPlacedSignatures((prev) => prev.map((s) => (s.id === drag.id ? { ...s, x: newX, y: newY, page: targetPage } : s)));
      } else if (resizeState.current) {
        const { id, startX, startWidth, aspect } = resizeState.current;
        const newWidth = Math.max(50, startWidth + (e.clientX - startX));
        setPlacedSignatures((prev) => prev.map((s) => (s.id === id ? { ...s, width: newWidth, height: newWidth / aspect } : s)));
      }
    };
    const onUp = () => {
      if (dragState.current) setLastUsedPage(dragState.current.currentPage);
      dragState.current = null;
      resizeState.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const reset = () => {
    setStatus("idle");
    setError("");
    setResult(null);
    setPreviewOpen(false);
  };

  const processAnother = () => {
    reset();
    setFile([]);
    setPdfBytes(null);
    setPageImages([]);
    setPageSizes([]);
    setPageScale([]);
    setSavedSignatures([]);
    setPlacedSignatures([]);
    setCreatorOpen(false);
    setLastUsedPage(0);
  };

  const handleSave = async () => {
    if (!pdfBytes) return;
    if (placedSignatures.length === 0) {
      setError(t("sign.needAtLeastOne"));
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const annotations: Annotation[] = placedSignatures.map((s) => ({
        id: s.id,
        type: "sign",
        page: s.page,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        dataUrl: s.dataUrl,
      }));
      const bytes = await bakeAnnotationsIntoPdf(pdfBytes, annotations, pageScale);
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      setResult({ blob, filename: "signed.pdf" });
      setStatus("success");
    } catch {
      setError(t("sign.saveFailed"));
      setStatus("error");
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("sign.title")} description={t("sign.description")} />

      {pageImages.length === 0 && (
        <div className="mt-6">
          <FileDropzone accept=".pdf,application/pdf" multiple={false} files={file} onChange={loadFile} />
          {loading && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t("sign.loadingPages")}</p>}
        </div>
      )}

      {pageImages.length > 0 && (
        <>
          <div className="sticky top-0 z-20 mt-6 space-y-3 rounded-xl border border-gray-200 bg-white/95 p-3 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCreatorOpen((v) => !v)}
                className="rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon/90"
              >
                + {t("sign.addSignature")}
              </button>

              {savedSignatures.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t("sign.yourSignatures")}</span>
                  {savedSignatures.map((sig) => (
                    <button
                      key={sig.id}
                      type="button"
                      onClick={() => placeSignature(sig.id, sig.dataUrl)}
                      className="rounded-lg border border-gray-300 bg-white p-1.5 hover:border-maroon dark:border-slate-600 dark:bg-slate-900"
                      title={t("sign.addSignature")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- small in-memory signature thumbnail */}
                      <img src={sig.dataUrl} alt="" className="h-8 w-16 object-contain" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {creatorOpen && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-3 flex gap-2">
                  {(["draw", "type", "upload"] as CreatorTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setCreatorTab(tab)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        creatorTab === tab ? "bg-maroon text-white" : "bg-white text-gray-600 dark:bg-slate-800 dark:text-gray-300"
                      }`}
                    >
                      {t(`sign.tab.${tab}` as const)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCreatorOpen(false)}
                    className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  >
                    {t("sign.cancel")}
                  </button>
                </div>
                {creatorTab === "draw" && <DrawTab onUse={handleNewSignature} />}
                {creatorTab === "type" && <TypeTab onUse={handleNewSignature} />}
                {creatorTab === "upload" && <UploadTab onUse={handleNewSignature} />}
              </div>
            )}
          </div>

          <div className="mt-6 space-y-8">
            {pageImages.map((src, pageIndex) => (
              <div key={pageIndex}>
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t("sign.page")} {pageIndex + 1}
                </p>
                <div
                  ref={(el) => {
                    pageRefs.current[pageIndex] = el;
                  }}
                  className="relative select-none border border-gray-200 shadow-sm dark:border-slate-700"
                  style={{ width: pageSizes[pageIndex]?.width, height: pageSizes[pageIndex]?.height }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamically rendered PDF page */}
                  <img src={src} alt={`Page ${pageIndex + 1}`} className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />

                  {placedSignatures
                    .filter((s) => s.page === pageIndex)
                    .map((s) => (
                      <div
                        key={s.id}
                        className="group absolute cursor-move border border-dashed border-maroon/70"
                        style={{ left: s.x, top: s.y, width: s.width, height: s.height }}
                        onMouseDown={(e) => startDrag(s, e)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- user-placed signature */}
                        <img src={s.dataUrl} alt="" className="pointer-events-none h-full w-full object-contain" draggable={false} />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePlaced(s.id);
                          }}
                          aria-label={t("sign.deleteSignature")}
                          className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <div
                          onMouseDown={(e) => startResize(s, e)}
                          className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-maroon shadow"
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            {status === "idle" && (
              <button type="button" onClick={() => void handleSave()} className="rounded-lg bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon/90">
                {t("sign.savePdf")}
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
