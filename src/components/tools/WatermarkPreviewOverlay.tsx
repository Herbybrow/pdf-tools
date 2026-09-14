"use client";

import { useEffect, useMemo } from "react";
import type { FieldValue } from "@/lib/useToolSubmission";

type WatermarkPreviewOverlayProps = {
  values: Record<string, FieldValue>;
  imageFile: File | null;
};

const ANCHOR_CLASS: Record<string, string> = {
  center: "items-center justify-center",
  "top-left": "items-start justify-start p-4 sm:p-6",
  "top-right": "items-start justify-end p-4 sm:p-6",
  "bottom-left": "items-end justify-start p-4 sm:p-6",
  "bottom-right": "items-end justify-end p-4 sm:p-6",
};

/** Live, approximate preview of where/how a watermark will land -- rendered as a plain
 * HTML overlay on top of the source-file preview rather than actually re-running the
 * backend, so opacity/rotation/position/text changes reflect instantly as the user
 * adjusts the form. It's positioned relative to the whole preview pane (not the exact
 * PDF page rect pdf.js rendered inside it), so it's a close visual approximation, not a
 * pixel-perfect match to the final output -- good enough to answer "roughly how will
 * this look" without wiring pixel-exact page geometry through from DocumentPreview. */
export default function WatermarkPreviewOverlay({ values, imageFile }: WatermarkPreviewOverlayProps) {
  const mode = String(values.mode ?? "text");
  const text = String(values.text ?? "") || "WATERMARK";
  const opacity = Math.min(100, Math.max(0, Number(values.opacity ?? 30))) / 100;
  const rotation = Number(values.rotation ?? 45);
  const position = String(values.position ?? "center");

  const imageUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile]);
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const mark =
    mode === "image" && imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- in-memory blob URL preview, not an optimizable asset
      <img src={imageUrl} alt="" style={{ opacity, transform: `rotate(${rotation}deg)` }} className="max-h-20 max-w-[45%] object-contain drop-shadow" />
    ) : (
      <span
        style={{ opacity, transform: `rotate(${rotation}deg)` }}
        className="whitespace-nowrap text-3xl font-black tracking-wide text-black"
      >
        {text}
      </span>
    );

  if (position === "tiled") {
    return (
      <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-4 place-items-center overflow-hidden">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i}>{mark}</div>
        ))}
      </div>
    );
  }

  return <div className={`pointer-events-none absolute inset-0 flex ${ANCHOR_CLASS[position] ?? ANCHOR_CLASS.center}`}>{mark}</div>;
}
