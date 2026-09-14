"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Pencil, QrCode, ScanSearch, Trash2, Upload } from "lucide-react";
import QRCode from "qrcode";
import { getCatalogTools } from "@/components/header";
import ToolPageHeader from "@/components/tools/ToolPageHeader";
import PreviewModal from "@/components/tools/PreviewModal";
import ScanPageEditor from "@/components/tools/ScanPageEditor";
import ToolResultPanel from "@/components/tools/ToolResultPanel";
import { apiUrl, ApiError, postForFile, triggerDownload } from "@/lib/apiClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { applyContrastBoost, warpPerspective, type Point } from "@/lib/imageProcessing";
import { isPreviewableBlob } from "@/lib/previewable";
import { generateId } from "@/lib/uuid";

type Capture = { id: string; dataUrl: string };
type PendingCapture = { canvas: HTMLCanvasElement; displayWidth: number; displayHeight: number; corners: Point[] };
type Status = "idle" | "loading" | "error" | "success";

const DISPLAY_MAX_WIDTH = 480;

function defaultCorners(width: number, height: number): Point[] {
  const insetX = width * 0.08;
  const insetY = height * 0.08;
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY },
  ];
}

/** Asks the backend to auto-detect the document boundary (real OpenCV contour
 * detection) in the full-resolution capture. Returns corners in the SAME pixel space
 * as `canvas`, or null if no confident quadrilateral was found -- callers keep the
 * manual default corners in that case. */
async function detectEdges(canvas: HTMLCanvasElement): Promise<Point[] | null> {
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return null;
  try {
    const formData = new FormData();
    formData.append("image", blob, "capture.jpg");
    const response = await fetch(apiUrl("/api/v1/organize/detect-document-edges"), { method: "POST", body: formData });
    if (!response.ok) return null;
    const body: { corners: Point[] | null } = await response.json();
    return body.corners;
  } catch {
    return null;
  }
}

export default function ScanToPdfPage({ slug }: { slug: string }) {
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${slug}`);
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragHandle = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [pending, setPending] = useState<PendingCapture | null>(null);
  const [detectingEdges, setDetectingEdges] = useState(false);
  const [contrastBoost, setContrastBoost] = useState(true);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [phoneMode, setPhoneMode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [phoneReceivedCount, setPhoneReceivedCount] = useState(0);
  const [phoneQueue, setPhoneQueue] = useState<string[]>([]);
  const [localhostWarning, setLocalhostWarning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      wsRef.current?.close();
    };
  }, []);

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError(t("scan.cameraError"));
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const refineCornersFromAutoDetect = (canvas: HTMLCanvasElement, scale: number) => {
    setDetectingEdges(true);
    detectEdges(canvas)
      .then((detected) => {
        if (!detected) return;
        setPending((prev) => (prev && prev.canvas === canvas ? { ...prev, corners: detected.map((p) => ({ x: p.x * scale, y: p.y * scale })) } : prev));
      })
      .finally(() => setDetectingEdges(false));
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0);
    const scale = Math.min(1, DISPLAY_MAX_WIDTH / canvas.width);
    setPending({
      canvas,
      displayWidth: canvas.width * scale,
      displayHeight: canvas.height * scale,
      corners: defaultCorners(canvas.width * scale, canvas.height * scale),
    });
    refineCornersFromAutoDetect(canvas, scale);
  };

  const loadImageSrc = useCallback((src: string) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      const scale = Math.min(1, DISPLAY_MAX_WIDTH / canvas.width);
      setPending({
        canvas,
        displayWidth: canvas.width * scale,
        displayHeight: canvas.height * scale,
        corners: defaultCorners(canvas.width * scale, canvas.height * scale),
      });
      refineCornersFromAutoDetect(canvas, scale);
    };
    img.src = src;
  }, []);

  const loadImageFile = useCallback((file: File) => loadImageSrc(URL.createObjectURL(file)), [loadImageSrc]);

  // Mirrors `pending` for the WebSocket handler below, which is assigned once per
  // phone-mode session rather than re-created every render -- reading React state
  // directly there would see whatever `pending` was at connection time, not its
  // current value. A ref always reads fresh, with no reactive-effect indirection.
  const pendingRef = useRef<PendingCapture | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Photos arriving from a phone while a page is already pending review are queued
  // rather than overwriting it. Called directly wherever `pending` is cleared
  // (confirmed or discarded) so one queued photo loads next, if any are waiting.
  const loadNextFromQueue = useCallback(() => {
    setPhoneQueue((prev) => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;
      loadImageSrc(next);
      return rest;
    });
  }, [loadImageSrc]);

  const startPhoneMode = async () => {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      setLocalhostWarning(true);
      return;
    }
    setLocalhostWarning(false);
    try {
      const sessionId = generateId();
      const mobileUrl = `${window.location.origin}/scan-mobile?session=${sessionId}`;
      const qr = await QRCode.toDataURL(mobileUrl, { width: 220, margin: 1 });

      const wsUrl = apiUrl(`/api/v1/organize/scan-session/${sessionId}/ws`).replace(/^http/, "ws");
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        const msg: { event: string; totalPages?: number; imageDataUrl?: string } = JSON.parse(event.data);
        if (msg.event === "page_added" && msg.imageDataUrl) {
          setPhoneReceivedCount(msg.totalPages ?? 0);
          if (pendingRef.current === null) {
            loadImageSrc(msg.imageDataUrl);
          } else {
            setPhoneQueue((prev) => [...prev, msg.imageDataUrl as string]);
          }
        }
      };
      ws.onerror = () => setCameraError(t("scan.qr.connectionError"));
      wsRef.current = ws;

      setQrDataUrl(qr);
      setPhoneReceivedCount(0);
      setPhoneMode(true);
    } catch {
      setCameraError(t("scan.qr.connectionError"));
    }
  };

  const stopPhoneMode = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setPhoneMode(false);
    setQrDataUrl(null);
  };

  const handleFileInput = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(loadImageFile);
  };

  const moveHandle = (clientX: number, clientY: number) => {
    if (dragHandle.current === null || !pending || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(pending.displayWidth, clientX - rect.left));
    const y = Math.max(0, Math.min(pending.displayHeight, clientY - rect.top));
    setPending((prev) => {
      if (!prev) return prev;
      const corners = [...prev.corners];
      corners[dragHandle.current as number] = { x, y };
      return { ...prev, corners };
    });
  };

  const confirmPage = () => {
    if (!pending) return;
    const scaleBack = pending.canvas.width / pending.displayWidth;
    const fullResCorners = pending.corners.map((p) => ({ x: p.x * scaleBack, y: p.y * scaleBack })) as [
      Point,
      Point,
      Point,
      Point,
    ];
    const outWidth = Math.round(
      Math.max(
        Math.hypot(fullResCorners[1].x - fullResCorners[0].x, fullResCorners[1].y - fullResCorners[0].y),
        Math.hypot(fullResCorners[2].x - fullResCorners[3].x, fullResCorners[2].y - fullResCorners[3].y),
      ),
    );
    const outHeight = Math.round(
      Math.max(
        Math.hypot(fullResCorners[3].x - fullResCorners[0].x, fullResCorners[3].y - fullResCorners[0].y),
        Math.hypot(fullResCorners[2].x - fullResCorners[1].x, fullResCorners[2].y - fullResCorners[1].y),
      ),
    );
    const warped = warpPerspective(pending.canvas, fullResCorners, Math.max(outWidth, 50), Math.max(outHeight, 50));
    if (contrastBoost) applyContrastBoost(warped, 35, 8);
    setCaptures((prev) => [...prev, { id: generateId(), dataUrl: warped.toDataURL("image/jpeg", 0.9) }]);
    setPending(null);
    loadNextFromQueue();
  };

  const discardPending = () => {
    setPending(null);
    loadNextFromQueue();
  };
  const removeCapture = (id: string) => setCaptures((prev) => prev.filter((c) => c.id !== id));
  const saveEditedCapture = (newDataUrl: string) => {
    setCaptures((prev) => prev.map((c) => (c.id === editingId ? { ...c, dataUrl: newDataUrl } : c)));
    setEditingId(null);
  };

  const reset = () => {
    setStatus("idle");
    setError("");
    setResult(null);
    setPreviewOpen(false);
  };

  const processAnother = () => {
    reset();
    setPending(null);
    setCaptures([]);
    setCameraError("");
    setEditingId(null);
    setPhoneQueue([]);
    stopPhoneMode();
  };

  const dataUrlToFile = (dataUrl: string, filename: string): File => {
    const [meta, base64] = dataUrl.split(",");
    const mime = /data:(.*);base64/.exec(meta)?.[1] ?? "image/jpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  };

  const handleSave = async () => {
    if (captures.length === 0) return;
    setStatus("loading");
    setError("");
    try {
      const formData = new FormData();
      captures.forEach((capture, index) => {
        formData.append("images", dataUrlToFile(capture.dataUrl, `page_${index + 1}.jpg`));
      });
      const { blob, filename } = await postForFile("/api/v1/organize/scan-to-pdf", formData, "scanned_document.pdf");
      setResult({ blob, filename });
      setStatus("success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.unexpectedError"));
      setStatus("error");
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-10">
      <ToolPageHeader icon={catalogEntry?.icon} iconClassName={catalogEntry?.iconClassName} title={t("scan.title")} description={t("scan.description")} />

      {!pending && (
        <div className="mt-6 space-y-4">
          {!cameraActive && !phoneMode ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startCamera}
                className="flex items-center gap-2 rounded-lg bg-maroon px-4 py-2.5 text-sm font-medium text-white hover:bg-maroon/90"
              >
                <Camera className="h-4 w-4" /> {t("scan.startCamera")}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800"
              >
                <Upload className="h-4 w-4" /> {t("scan.uploadInstead")}
              </button>
              <button
                type="button"
                onClick={() => void startPhoneMode()}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800"
              >
                <QrCode className="h-4 w-4" /> {t("scan.scanFromPhone")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileInput(e.target.files)}
              />
            </div>
          ) : cameraActive ? (
            <div>
              <video ref={videoRef} className="w-full max-w-md rounded-xl border border-gray-200 dark:border-slate-700" muted playsInline />
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="rounded-lg bg-maroon px-4 py-2.5 text-sm font-medium text-white hover:bg-maroon/90"
                >
                  {t("scan.capturePage")}
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800"
                >
                  {t("scan.stopCamera")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-gray-200 p-6 text-center dark:border-slate-700">
              <p className="max-w-xs text-sm text-gray-600 dark:text-gray-400">{t("scan.qr.instruction")}</p>
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- locally generated QR code data URL
                <img src={qrDataUrl} alt="QR code" className="mt-4 h-55 w-55 rounded-lg border border-gray-200 dark:border-slate-600" />
              )}
              <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <ScanSearch className="h-3.5 w-3.5 animate-pulse text-maroon" />
                {phoneReceivedCount > 0 ? `${phoneReceivedCount} ${t("scan.qr.received")}` : t("scan.qr.waiting")}
              </p>
              <button
                type="button"
                onClick={stopPhoneMode}
                className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200"
              >
                {t("scan.qr.back")}
              </button>
            </div>
          )}
          {cameraError && <p className="text-sm text-amber-600 dark:text-amber-400">{cameraError}</p>}
          {localhostWarning && <p className="max-w-md text-sm text-amber-600 dark:text-amber-400">{t("scan.qr.localhostWarning")}</p>}
        </div>
      )}

      {pending && (
        <div className="mt-6">
          <p className="mb-2 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
            {detectingEdges ? (
              <>
                <ScanSearch className="h-4 w-4 animate-pulse text-maroon" /> {t("scan.detecting")}
              </>
            ) : (
              t("scan.dragCorners")
            )}
          </p>
          {phoneQueue.length > 0 && (
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {phoneQueue.length} {t("scan.qr.moreWaiting")}
            </p>
          )}
          <div
            ref={overlayRef}
            className="relative select-none"
            style={{ width: pending.displayWidth, height: pending.displayHeight }}
            onMouseMove={(e) => moveHandle(e.clientX, e.clientY)}
            onMouseUp={() => (dragHandle.current = null)}
            onMouseLeave={() => (dragHandle.current = null)}
            onTouchMove={(e) => moveHandle(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchEnd={() => (dragHandle.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamically captured canvas frame, not a static asset */}
            <img src={pending.canvas.toDataURL("image/jpeg", 0.85)} alt="Captured page" className="h-full w-full rounded-lg" draggable={false} />
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <polygon
                points={pending.corners.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(144,45,48,0.15)"
                stroke="#902d30"
                strokeWidth={2}
              />
            </svg>
            {pending.corners.map((corner, index) => (
              <div
                key={index}
                onMouseDown={() => (dragHandle.current = index)}
                onTouchStart={() => (dragHandle.current = index)}
                className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-maroon shadow"
                style={{ left: corner.x, top: corner.y }}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={confirmPage} className="rounded-lg bg-maroon px-4 py-2.5 text-sm font-medium text-white hover:bg-maroon/90">
              {t("scan.confirmPage")}
            </button>
            <button
              type="button"
              onClick={discardPending}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              {t("scan.discard")}
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={contrastBoost} onChange={(e) => setContrastBoost(e.target.checked)} className="h-4 w-4 rounded text-maroon" />
              {t("scan.boostContrast")}
            </label>
          </div>
        </div>
      )}

      {captures.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {t("scan.capturedPages")} ({captures.length})
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {captures.map((capture, index) => (
              <div key={capture.id} className="relative rounded-lg border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
                <div className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{index + 1}</div>
                {/* eslint-disable-next-line @next/next/no-img-element -- dynamically processed scan thumbnail */}
                <img src={capture.dataUrl} alt={`Scanned page ${index + 1}`} className="h-28 w-full rounded object-cover" />
                <div className="absolute right-1 top-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(capture.id)}
                    className="rounded bg-black/60 p-1 text-white hover:bg-maroon"
                    aria-label={t("scan.editPage")}
                    title={t("scan.editPage")}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCapture(capture.id)}
                    className="rounded bg-black/60 p-1 text-white hover:bg-red-600"
                    aria-label="Remove page"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            {status === "idle" && (
              <button type="button" onClick={handleSave} className="rounded-lg bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon/90">
                {t("scan.saveAsPdf")}
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
        </div>
      )}

      {previewOpen && result && (
        <PreviewModal blob={result.blob} filename={result.filename} onClose={() => setPreviewOpen(false)} />
      )}

      {editingId && (
        <ScanPageEditor
          dataUrl={captures.find((c) => c.id === editingId)!.dataUrl}
          onSave={saveEditedCapture}
          onCancel={() => setEditingId(null)}
        />
      )}
    </main>
  );
}
