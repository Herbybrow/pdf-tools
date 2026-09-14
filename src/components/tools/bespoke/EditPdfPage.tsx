"use client";

import { useRef, useState } from "react";
import { Circle, ImageIcon, Minus, MousePointer2, PenLine, Square, Trash2, Type } from "lucide-react";
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
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type Tool = "select" | "text" | "image" | "rect" | "ellipse" | "line" | "sign";
type Status = "idle" | "loading" | "error" | "success";
type DragState = { annotationId: string; offsetX: number; offsetY: number } | null;
type DrawState = { page: number; startX: number; startY: number } | null;
type ResizeState = { annotationId: string; startWidth: number; startHeight: number; startX: number; startY: number } | null;

const DEFAULT_COLOR = "#902d30";
const COLOR_PALETTE = ["#902d30", "#111111", "#dc2626", "#2563eb", "#16a34a", "#7c3aed", "#f59e0b", "#ffffff"];

function newId() {
  return crypto.randomUUID();
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={color}
          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
            value.toLowerCase() === color ? "border-maroon" : "border-gray-300 dark:border-slate-600"
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded-full border-2 border-gray-300 bg-transparent p-0 dark:border-slate-600"
        aria-label="Custom color"
      />
    </div>
  );
}

type PositionedMediaAnnotation = Extract<Annotation, { type: "text" | "image" | "sign" }>;

function isPositionedMedia(annotation: Annotation): annotation is PositionedMediaAnnotation {
  return annotation.type === "text" || annotation.type === "image" || annotation.type === "sign";
}

const PEN_SIZES = [1.5, 2.5, 4, 6];

function SignaturePad({ onAdd, onCancel }: { onAdd: (dataUrl: string) => void; onCancel: () => void }) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [penColor, setPenColor] = useState("#111111");
  const [penSize, setPenSize] = useState(2.5);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
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
    ctx.lineWidth = penSize;
    ctx.lineCap = "round";
    ctx.strokeStyle = penColor;
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
    <div className="rounded-xl border border-gray-300 bg-white p-4 shadow-lg dark:border-slate-600 dark:bg-slate-800">
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{t("edit.signature.instruction")}</p>

      <div className="mb-2 flex flex-wrap items-center gap-4">
        <ColorSwatches value={penColor} onChange={setPenColor} />
        <div className="flex items-center gap-1.5">
          {PEN_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setPenSize(size)}
              aria-label={`${t("edit.signature.penSize")} ${size}`}
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                penSize === size ? "border-maroon bg-maroon/10" : "border-gray-300 dark:border-slate-600"
              }`}
            >
              <span className="rounded-full bg-current" style={{ width: size + 2, height: size + 2, color: penColor }} />
            </button>
          ))}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={320}
        height={140}
        className="cursor-crosshair rounded border border-dashed border-gray-300 bg-white dark:border-slate-600"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={clear} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200">
          {t("edit.signature.clear")}
        </button>
        <button
          type="button"
          onClick={() => canvasRef.current && onAdd(canvasRef.current.toDataURL("image/png"))}
          className="rounded-lg bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon/90"
        >
          {t("edit.signature.add")}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">
          {t("edit.signature.cancel")}
        </button>
      </div>
    </div>
  );
}

export default function EditPdfPage({ slug }: { slug: string }) {
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${slug}`);
  const { t } = useLanguage();
  const [file, setFile] = useState<File[]>([]);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [pageScale, setPageScale] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeColor, setActiveColor] = useState(DEFAULT_COLOR);
  const [activeFontSize, setActiveFontSize] = useState(14);
  const [activeStrokeWidth, setActiveStrokeWidth] = useState(2);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<DragState>(null);
  const drawState = useRef<DrawState>(null);
  const resizeState = useRef<ResizeState>(null);
  const [livePreview, setLivePreview] = useState<Annotation | null>(null);
  const pendingImageClick = useRef<{ page: number; x: number; y: number } | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{ wrongPassword: boolean } | null>(null);

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
      // when awaited in a loop. PNG stays here (not the JPEG the smaller thumbnail
      // previews elsewhere use): this is the actual editing canvas, so it's worth keeping
      // lossless where annotations get placed pixel-precisely on top of it.
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
      setAnnotations([]);
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

  const addAnnotation = (annotation: Annotation) => {
    setAnnotations((prev) => [...prev, annotation]);
    setSelectedId(annotation.id);
    setTool("select");
  };

  const updateAnnotation = (id: string, patch: Partial<Annotation>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  };

  const handleCanvasClick = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === "text") {
      addAnnotation({
        id: newId(),
        type: "text",
        page: pageIndex,
        x,
        y,
        width: 220,
        height: 30,
        text: t("edit.doubleClickToEdit"),
        fontSize: activeFontSize,
        color: activeColor,
      });
    } else if (tool === "image") {
      pendingImageClick.current = { page: pageIndex, x, y };
      imageInputRef.current?.click();
    }
  };

  // Deselecting on background mousedown (not click): selecting an annotation shows the
  // properties bar above the page, which shifts the canvas down. A real click is
  // mousedown+mouseup+click at the same screen pixel -- if that pixel is over an
  // annotation, mousedown selects it and the layout immediately reflows, so by the time
  // the trailing click event is dispatched, that same pixel can now be over the (shifted)
  // empty background instead, incorrectly wiping the very selection just made. Handling
  // this on mousedown sidesteps the race entirely: it runs before any reflow from this
  // gesture, and it only fires when the press itself started on empty background (an
  // annotation's own onMouseDown calls stopPropagation, so this never overrides it).
  const handlePageMouseDown = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    handleShapeMouseDown(pageIndex, e);
    if (tool === "select" && e.target === e.currentTarget) {
      setSelectedId(null);
    }
  };

  const handleImageChosen = (fileList: FileList | null) => {
    const chosen = fileList?.[0];
    const click = pendingImageClick.current;
    if (!chosen || !click) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const width = Math.min(200, img.width);
        const height = width * (img.height / img.width);
        addAnnotation({ id: newId(), type: "image", page: click.page, x: click.x, y: click.y, width, height, dataUrl });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(chosen);
    pendingImageClick.current = null;
  };

  const handleShapeMouseDown = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "rect" && tool !== "ellipse" && tool !== "line") return;
    const rect = e.currentTarget.getBoundingClientRect();
    drawState.current = { page: pageIndex, startX: e.clientX - rect.left, startY: e.clientY - rect.top };
  };

  const handleShapeMouseMove = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawState.current || drawState.current.page !== pageIndex) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { startX, startY } = drawState.current;
    if (tool === "line") {
      setLivePreview({ id: "preview", type: "line", page: pageIndex, x1: startX, y1: startY, x2: x, y2: y, color: activeColor, strokeWidth: activeStrokeWidth });
    } else {
      const x0 = Math.min(startX, x);
      const y0 = Math.min(startY, y);
      const w = Math.abs(x - startX);
      const h = Math.abs(y - startY);
      setLivePreview({ id: "preview", type: tool === "rect" ? "rect" : "ellipse", page: pageIndex, x: x0, y: y0, width: w, height: h, color: activeColor, strokeWidth: activeStrokeWidth });
    }
  };

  const handleShapeMouseUp = () => {
    if (drawState.current && livePreview) {
      const finalized: Annotation = { ...livePreview, id: newId() } as Annotation;
      const hasSize = finalized.type === "line" ? true : (finalized as { width: number }).width > 4;
      if (hasSize) addAnnotation(finalized);
    }
    drawState.current = null;
    setLivePreview(null);
  };

  const startDragAnnotation = (annotation: Annotation, e: React.MouseEvent) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelectedId(annotation.id);
    const anyAnnotation = annotation as Annotation & { x?: number; y?: number };
    const baseX = "x" in annotation ? anyAnnotation.x! : (annotation as { x1: number }).x1;
    const baseY = "y" in annotation ? anyAnnotation.y! : (annotation as { y1: number }).y1;
    dragState.current = { annotationId: annotation.id, offsetX: e.clientX - baseX, offsetY: e.clientY - baseY };
  };

  const handlePageMouseMoveForDrag = (e: React.MouseEvent) => {
    if (!dragState.current) return;
    const { annotationId, offsetX, offsetY } = dragState.current;
    const newX = e.clientX - offsetX;
    const newY = e.clientY - offsetY;
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id !== annotationId) return a;
        if (a.type === "line") return { ...a, x2: newX + (a.x2 - a.x1), y2: newY + (a.y2 - a.y1), x1: newX, y1: newY };
        return { ...a, x: newX, y: newY };
      }),
    );
  };

  const stopDrag = () => {
    dragState.current = null;
  };

  const startResizeAnnotation = (annotation: PositionedMediaAnnotation, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(annotation.id);
    resizeState.current = {
      annotationId: annotation.id,
      startWidth: annotation.width,
      startHeight: annotation.height,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const handlePageMouseMoveForResize = (e: React.MouseEvent) => {
    if (!resizeState.current) return;
    const { annotationId, startWidth, startHeight, startX, startY } = resizeState.current;
    const nextWidth = Math.max(20, startWidth + (e.clientX - startX));
    const nextHeight = Math.max(16, startHeight + (e.clientY - startY));
    setAnnotations((prev) =>
      prev.map((a) => (a.id === annotationId && isPositionedMedia(a) ? { ...a, width: nextWidth, height: nextHeight } : a)),
    );
  };

  const stopResize = () => {
    resizeState.current = null;
  };

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
    setTool("select");
    setAnnotations([]);
    setSelectedId(null);
    setShowSignaturePad(false);
    setLivePreview(null);
  };

  const handleSave = async () => {
    if (!pdfBytes) return;
    setStatus("loading");
    setError("");
    try {
      const bytes = await bakeAnnotationsIntoPdf(pdfBytes, annotations, pageScale);
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      setResult({ blob, filename: "edited.pdf" });
      setStatus("success");
    } catch {
      setError(t("edit.saveFailed"));
      setStatus("error");
    }
  };

  const selectedAnnotation = annotations.find((a) => a.id === selectedId) ?? null;

  const tools: { id: Tool; label: string; icon: React.ElementType }[] = [
    { id: "select", label: t("edit.tool.select"), icon: MousePointer2 },
    { id: "text", label: t("edit.tool.text"), icon: Type },
    { id: "image", label: t("edit.tool.image"), icon: ImageIcon },
    { id: "rect", label: t("edit.tool.rectangle"), icon: Square },
    { id: "ellipse", label: t("edit.tool.circle"), icon: Circle },
    { id: "line", label: t("edit.tool.line"), icon: Minus },
    { id: "sign", label: t("edit.tool.signature"), icon: PenLine },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("edit.title")} description={t("edit.description")} />

      {pageImages.length === 0 && (
        <div className="mt-6">
          <FileDropzone accept=".pdf,application/pdf" multiple={false} files={file} onChange={loadFile} />
          {loading && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t("edit.loadingPages")}</p>}
        </div>
      )}

      {pageImages.length > 0 && (
        <>
          <div className="sticky top-0 z-20 mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white/95 p-2 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
            {tools.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                title={label}
                onClick={() => (id === "sign" ? setShowSignaturePad(true) : setTool(id))}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${
                  tool === id ? "bg-maroon text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
            {selectedId && (
              <button
                type="button"
                onClick={deleteSelected}
                className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" /> {t("edit.deleteSelected")}
              </button>
            )}
          </div>

          {(tool === "text" || tool === "rect" || tool === "ellipse" || tool === "line" || selectedAnnotation) && (
            <div className="mt-2 flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white/95 p-3 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("edit.color")}</span>
                <ColorSwatches
                  value={selectedAnnotation && "color" in selectedAnnotation ? selectedAnnotation.color : activeColor}
                  onChange={(color) => {
                    if (selectedAnnotation && "color" in selectedAnnotation) updateAnnotation(selectedAnnotation.id, { color } as Partial<Annotation>);
                    else setActiveColor(color);
                  }}
                />
              </div>

              {(selectedAnnotation?.type === "text" || (!selectedAnnotation && tool === "text")) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("edit.fontSize")}</span>
                  <input
                    type="number"
                    min={8}
                    max={96}
                    value={selectedAnnotation?.type === "text" ? selectedAnnotation.fontSize : activeFontSize}
                    onChange={(e) => {
                      const size = Number(e.target.value);
                      if (selectedAnnotation?.type === "text") updateAnnotation(selectedAnnotation.id, { fontSize: size });
                      else setActiveFontSize(size);
                    }}
                    className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                </div>
              )}

              {((selectedAnnotation && (selectedAnnotation.type === "rect" || selectedAnnotation.type === "ellipse" || selectedAnnotation.type === "line")) ||
                (!selectedAnnotation && (tool === "rect" || tool === "ellipse" || tool === "line"))) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("edit.strokeWidth")}</span>
                  {[1, 2, 4, 6].map((width) => {
                    const current =
                      selectedAnnotation && "strokeWidth" in selectedAnnotation ? selectedAnnotation.strokeWidth : activeStrokeWidth;
                    return (
                      <button
                        key={width}
                        type="button"
                        onClick={() => {
                          if (selectedAnnotation && "strokeWidth" in selectedAnnotation)
                            updateAnnotation(selectedAnnotation.id, { strokeWidth: width } as Partial<Annotation>);
                          else setActiveStrokeWidth(width);
                        }}
                        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                          current === width ? "border-maroon bg-maroon/10" : "border-gray-300 dark:border-slate-600"
                        }`}
                      >
                        <span className="rounded-full bg-current" style={{ width: width + 2, height: width + 2 }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {showSignaturePad && (
            <div className="mt-4">
              <SignaturePad
                onCancel={() => setShowSignaturePad(false)}
                onAdd={(dataUrl) => {
                  addAnnotation({ id: newId(), type: "sign", page: 0, x: 60, y: 60, width: 180, height: 80, dataUrl });
                  setShowSignaturePad(false);
                }}
              />
            </div>
          )}

          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChosen(e.target.files)} />

          <div className="mt-6 space-y-8">
            {pageImages.map((src, pageIndex) => (
              <div key={pageIndex}>
                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t("edit.page")} {pageIndex + 1}
                </p>
                <div
                  className="relative select-none border border-gray-200 shadow-sm dark:border-slate-700"
                  style={{ width: pageSizes[pageIndex]?.width, height: pageSizes[pageIndex]?.height }}
                  onClick={(e) => handleCanvasClick(pageIndex, e)}
                  onMouseDown={(e) => handlePageMouseDown(pageIndex, e)}
                  onMouseMove={(e) => {
                    handleShapeMouseMove(pageIndex, e);
                    handlePageMouseMoveForDrag(e);
                    handlePageMouseMoveForResize(e);
                  }}
                  onMouseUp={() => {
                    handleShapeMouseUp();
                    stopDrag();
                    stopResize();
                  }}
                  onMouseLeave={() => {
                    stopDrag();
                    stopResize();
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamically rendered PDF page */}
                  <img src={src} alt={`Page ${pageIndex + 1}`} className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />

                  <svg data-testid="annotation-layer" className="pointer-events-none absolute inset-0 h-full w-full">
                    {[...annotations.filter((a) => a.page === pageIndex), ...(livePreview?.page === pageIndex ? [livePreview] : [])].map((a) => {
                      const interactive =
                        a.id !== "preview"
                          ? { style: { pointerEvents: "all" as const, cursor: tool === "select" ? "move" : "default" }, onMouseDown: (e: React.MouseEvent) => startDragAnnotation(a, e) }
                          : {};
                      const selectionDash = selectedId === a.id ? "4 3" : undefined;
                      if (a.type === "rect")
                        return (
                          <rect
                            key={a.id}
                            x={a.x}
                            y={a.y}
                            width={a.width}
                            height={a.height}
                            fill="none"
                            stroke={a.color}
                            strokeWidth={a.strokeWidth}
                            strokeDasharray={selectionDash}
                            {...interactive}
                          />
                        );
                      if (a.type === "ellipse")
                        return (
                          <ellipse
                            key={a.id}
                            cx={a.x + a.width / 2}
                            cy={a.y + a.height / 2}
                            rx={a.width / 2}
                            ry={a.height / 2}
                            fill="none"
                            stroke={a.color}
                            strokeWidth={a.strokeWidth}
                            strokeDasharray={selectionDash}
                            {...interactive}
                          />
                        );
                      if (a.type === "line")
                        return (
                          <line
                            key={a.id}
                            x1={a.x1}
                            y1={a.y1}
                            x2={a.x2}
                            y2={a.y2}
                            stroke={a.color}
                            strokeWidth={a.strokeWidth}
                            strokeDasharray={selectionDash}
                            {...interactive}
                          />
                        );
                      return null;
                    })}
                  </svg>

                  {annotations
                    .filter((a) => a.page === pageIndex)
                    .filter(isPositionedMedia)
                    .map((a) => {
                      const isSelected = selectedId === a.id;
                      const resizeHandle = isSelected && (
                        <div
                          key={`${a.id}-resize`}
                          onMouseDown={(e) => startResizeAnnotation(a, e)}
                          className="absolute h-3 w-3 cursor-nwse-resize rounded-full border-2 border-white bg-maroon shadow"
                          style={{ left: a.x + a.width - 6, top: a.y + a.height - 6 }}
                        />
                      );

                      if (a.type === "text") {
                        return (
                          <div key={a.id}>
                            <div
                              onMouseDown={(e) => startDragAnnotation(a, e)}
                              onDoubleClick={(e) => e.stopPropagation()}
                              className={`absolute cursor-move whitespace-pre-wrap border ${isSelected ? "border-maroon" : "border-transparent"}`}
                              style={{ left: a.x, top: a.y, width: a.width, minHeight: a.height, fontSize: a.fontSize, color: a.color }}
                            >
                              <span
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => updateAnnotation(a.id, { text: e.currentTarget.textContent ?? "" })}
                              >
                                {a.text}
                              </span>
                            </div>
                            {resizeHandle}
                          </div>
                        );
                      }
                      return (
                        <div key={a.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- user-placed image/signature annotation */}
                          <img
                            src={a.dataUrl}
                            alt=""
                            onMouseDown={(e) => startDragAnnotation(a, e)}
                            className={`absolute cursor-move border ${isSelected ? "border-maroon" : "border-transparent"}`}
                            style={{ left: a.x, top: a.y, width: a.width, height: a.height }}
                            draggable={false}
                          />
                          {resizeHandle}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            {status === "idle" && (
              <button type="button" onClick={handleSave} className="rounded-lg bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon/90">
                {t("edit.savePdf")}
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
