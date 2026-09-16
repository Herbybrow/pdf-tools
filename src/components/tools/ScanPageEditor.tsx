"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type FilterPreset = "none" | "bw" | "mono" | "sepia";
type Adjustments = { brightness: number; contrast: number; saturation: number; hue: number; temperature: number };
type CropRect = { x: number; y: number; width: number; height: number };

const DISPLAY_MAX_WIDTH = 480;
const DEFAULT_ADJUSTMENTS: Adjustments = { brightness: 100, contrast: 100, saturation: 100, hue: 0, temperature: 0 };
const FILTER_PRESETS: FilterPreset[] = ["none", "bw", "mono", "sepia"];

function cssFilterString(preset: FilterPreset, adj: Adjustments): string {
  const parts = [`brightness(${adj.brightness}%)`, `contrast(${adj.contrast}%)`, `saturate(${adj.saturation}%)`, `hue-rotate(${adj.hue}deg)`];
  if (preset === "bw") parts.push("grayscale(100%)");
  if (preset === "mono") parts.push("grayscale(100%)", "contrast(140%)");
  if (preset === "sepia") parts.push("sepia(70%)");
  return parts.join(" ");
}

type ScanPageEditorProps = {
  dataUrl: string;
  onSave: (newDataUrl: string) => void;
  onCancel: () => void;
};

export default function ScanPageEditor({ dataUrl, onSave, onCancel }: ScanPageEditorProps) {
  const { t } = useLanguage();
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragState = useRef<{ mode: "move" | "resize"; startX: number; startY: number; crop: CropRect } | null>(null);

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [preset, setPreset] = useState<FilterPreset>("none");
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const scale = Math.min(1, DISPLAY_MAX_WIDTH / img.naturalWidth);
      const width = img.naturalWidth * scale;
      const height = img.naturalHeight * scale;
      setSize({ width, height });
      setCrop({ x: 0, y: 0, width, height });
    };
    img.src = dataUrl;
  }, [dataUrl]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !size) return;
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.filter = cssFilterString(preset, adjustments);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    ctx.filter = "none";

    if (adjustments.temperature !== 0) {
      import("@/lib/imageProcessing").then(({ applyTemperature }) => {
        if (previewCanvasRef.current === canvas) {
          applyTemperature(canvas, adjustments.temperature);
        }
      });
    }
  }, [size, preset, adjustments]);

  const resetAdjustments = () => setAdjustments(DEFAULT_ADJUSTMENTS);

  const startDrag = (mode: "move" | "resize", e: React.MouseEvent) => {
    if (!crop) return;
    e.stopPropagation();
    dragState.current = { mode, startX: e.clientX, startY: e.clientY, crop };
  };

  const onDragMove = (e: React.MouseEvent) => {
    if (!dragState.current || !size) return;
    const { mode, startX, startY, crop: startCrop } = dragState.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (mode === "move") {
      const x = Math.max(0, Math.min(size.width - startCrop.width, startCrop.x + dx));
      const y = Math.max(0, Math.min(size.height - startCrop.height, startCrop.y + dy));
      setCrop({ ...startCrop, x, y });
    } else {
      const width = Math.max(30, Math.min(size.width - startCrop.x, startCrop.width + dx));
      const height = Math.max(30, Math.min(size.height - startCrop.y, startCrop.height + dy));
      setCrop({ ...startCrop, width, height });
    }
  };

  const stopDrag = () => {
    dragState.current = null;
  };

  const handleSave = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !crop || !size) return;
    const scaleToNatural = imgRef.current ? imgRef.current.naturalWidth / size.width : 1;
    const out = document.createElement("canvas");
    out.width = Math.round(crop.width * scaleToNatural);
    out.height = Math.round(crop.height * scaleToNatural);
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      canvas,
      crop.x * scaleToNatural,
      crop.y * scaleToNatural,
      crop.width * scaleToNatural,
      crop.height * scaleToNatural,
      0,
      0,
      out.width,
      out.height,
    );
    onSave(out.toDataURL("image/jpeg", 0.9));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t("scan.edit.title")}</h2>
          <button type="button" onClick={onCancel} aria-label={t("common.cancel")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {size && crop ? (
          <>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t("scan.edit.cropHint")}</p>
            <div
              className="relative mt-2 select-none self-center"
              style={{ width: size.width, height: size.height }}
              onMouseMove={onDragMove}
              onMouseUp={stopDrag}
              onMouseLeave={stopDrag}
            >
              <canvas ref={previewCanvasRef} className="absolute inset-0 rounded border border-gray-200 dark:border-slate-600" />
              {/* Dim everything outside the crop rectangle */}
              <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/50" style={{ height: crop.y }} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50" style={{ top: crop.y + crop.height }} />
              <div className="pointer-events-none absolute bg-black/50" style={{ left: 0, top: crop.y, width: crop.x, height: crop.height }} />
              <div className="pointer-events-none absolute bg-black/50" style={{ left: crop.x + crop.width, top: crop.y, right: 0, height: crop.height }} />
              <div
                onMouseDown={(e) => startDrag("move", e)}
                className="absolute cursor-move border-2 border-dashed border-maroon"
                style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
              >
                <div
                  onMouseDown={(e) => startDrag("resize", e)}
                  className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-maroon shadow"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {FILTER_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    preset === p ? "bg-maroon text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200"
                  }`}
                >
                  {t(`scan.edit.filter.${p}` as const)}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  { key: "brightness", label: t("scan.edit.brightness"), min: 50, max: 150 },
                  { key: "contrast", label: t("scan.edit.contrast"), min: 50, max: 150 },
                  { key: "saturation", label: t("scan.edit.saturation"), min: 0, max: 200 },
                  { key: "hue", label: t("scan.edit.hue"), min: -180, max: 180 },
                  { key: "temperature", label: t("scan.edit.temperature"), min: -50, max: 50 },
                ] as const
              ).map((slider) => (
                <label key={slider.key} className="text-xs text-gray-600 dark:text-gray-300">
                  {slider.label}
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    value={adjustments[slider.key]}
                    onChange={(e) => setAdjustments((prev) => ({ ...prev, [slider.key]: Number(e.target.value) }))}
                    className="mt-1 w-full accent-maroon"
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
              <button type="button" onClick={resetAdjustments} className="text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400">
                {t("scan.edit.reset")}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200"
                >
                  {t("common.cancel")}
                </button>
                <button type="button" onClick={handleSave} className="rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon/90">
                  {t("scan.edit.save")}
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t("scan.edit.loading")}</p>
        )}
      </div>
    </div>
  );
}