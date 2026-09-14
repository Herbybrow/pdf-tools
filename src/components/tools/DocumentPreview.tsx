"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type DocumentPreviewProps = {
  blob: Blob;
  filename?: string;
  /** "inline" (workspace side pane, more compact chrome) or "modal" (fullscreen, larger
   * render target + thumbnail rail always shown). */
  variant?: "inline" | "modal";
};

const RENDER_WIDTH = { inline: 760, modal: 1100 };

/** Hand-rolled, deliberately tiny renderer for the handful of Markdown constructs our
 * own PDF-to-Markdown output actually produces (#/##/### headings, "- " bullets, blank
 * lines) -- pulling in a full Markdown parser/library for a preview pane isn't worth it,
 * and building React elements directly (no dangerouslySetInnerHTML) means there's no HTML
 * injection surface even though the content is our own conversion output. */
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 sm:px-10">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return (
            <h3 key={i} className="mt-4 text-base font-bold text-gray-900 dark:text-gray-100">
              {line.slice(4)}
            </h3>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="mt-5 text-lg font-extrabold text-gray-900 dark:text-gray-100">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h1 key={i} className="mt-6 text-xl font-black text-gray-900 dark:text-gray-100">
              {line.slice(2)}
            </h1>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <li key={i} className="ml-5 list-disc text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {line.slice(2)}
            </li>
          );
        }
        if (!line.trim()) return <div key={i} className="h-3" aria-hidden />;
        return (
          <p key={i} className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {line}
          </p>
        );
      })}
    </div>
  );
}

function PlainTextPreview({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap wrap-break-word px-6 py-6 font-mono text-xs leading-relaxed text-gray-700 dark:text-gray-300">
      {text}
    </pre>
  );
}

function ImageBlobPreview({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-100 p-4 dark:bg-slate-900">
      {/* eslint-disable-next-line @next/next/no-img-element -- in-memory blob URL, not an optimizable asset */}
      <img src={url} alt="" className="max-h-full max-w-full rounded object-contain shadow" />
    </div>
  );
}

function TextBlobPreview({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    blob.text().then((value) => {
      if (!cancelled) setText(value);
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (text === null) return null;
  return blob.type === "text/markdown" ? <SimpleMarkdown text={text} /> : <PlainTextPreview text={text} />;
}

function PdfPagePreview({ blob, variant }: { blob: Blob; variant: "inline" | "modal" }) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Load the document once per blob. The parent gives this component a fresh `key` per
  // distinct blob (see DocumentPreview below), so a blob change remounts it with clean
  // initial state instead of needing to reset loading/failed/thumbnails/pageIndex here.
  useEffect(() => {
    let cancelled = false;
    let activeTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    (async () => {
      try {
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        activeTask = pdfjsLib.getDocument({ data: buffer });
        const doc = await activeTask.promise;
        if (cancelled) {
          void activeTask.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (activeTask) void activeTask.destroy();
      docRef.current = null;
    };
  }, [blob]);

  // Render the current page onto the canvas.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || numPages === 0) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      const unscaled = page.getViewport({ scale: 1 });
      const targetWidth = RENDER_WIDTH[variant];
      const scale = Math.min(targetWidth / unscaled.width, 3);
      const viewport = page.getViewport({ scale });
      if (cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [numPages, pageIndex, variant]);

  // Thumbnail rail, only worth the extra render pass once there's more than one page.
  // Reuses docRef.current (already loaded for the main page view above) instead of
  // calling renderPdfThumbnails, which would re-fetch and re-parse the same blob into a
  // second, entirely separate pdf.js document just to build the rail -- real duplicate
  // work for a file that's already sitting there loaded. Pages render concurrently for
  // the same reason as renderPdfThumbnails: nothing here needs to wait its turn.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || numPages < 2) return;
    let cancelled = false;

    Promise.all(
      Array.from({ length: numPages }, async (_, index) => {
        const page = await doc.getPage(index + 1);
        const viewport = page.getViewport({ scale: 0.22 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        page.cleanup();
        return dataUrl;
      }),
    )
      .then((thumbs) => {
        if (!cancelled) setThumbnails(thumbs);
      })
      .catch(() => {
        /* thumbnail rail is a nicety, not essential -- fail silently */
      });

    return () => {
      cancelled = true;
    };
  }, [numPages]);

  if (failed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-400 dark:text-gray-500">
        <FileText className="h-12 w-12" aria-hidden />
        <p className="max-w-xs text-sm">{t("workspace.previewUnavailable")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      {thumbnails.length > 0 && (
        <div className="hidden w-20 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-700/60 bg-slate-950/40 p-2 sm:flex">
          {thumbnails.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPageIndex(i)}
              className={`overflow-hidden rounded-md border-2 transition-colors ${
                i === pageIndex ? "border-gold" : "border-transparent hover:border-slate-500"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL thumbnail */}
              <img src={src} alt={`Page ${i + 1}`} className="w-full" />
            </button>
          ))}
        </div>
      )}

      <div className="relative flex flex-1 flex-col overflow-auto bg-[#525659]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#525659]/80">
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          </div>
        )}
        <div className="flex flex-1 items-start justify-center p-4 sm:p-6">
          <canvas ref={canvasRef} className="max-w-full rounded-sm shadow-2xl" />
        </div>
      </div>

      {numPages > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <div className="flex items-center gap-3 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              disabled={pageIndex === 0}
              aria-label={t("workspace.previousPage")}
              className="rounded-full p-1 hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              {pageIndex + 1} / {numPages}
            </span>
            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.min(numPages - 1, i + 1))}
              disabled={pageIndex === numPages - 1}
              aria-label={t("workspace.nextPage")}
              className="rounded-full p-1 hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Unified in-app preview for a result/source blob -- a custom-rendered PDF page viewer
 * (canvas + thumbnail rail + page nav, styled to match the app rather than the browser's
 * own PDF plugin chrome), a centered image, or a lightweight text/Markdown render. Used
 * by both the workspace inline pane and the fullscreen PreviewModal. */
export default function DocumentPreview({ blob, variant = "inline" }: DocumentPreviewProps) {
  if (blob.type === "application/pdf") {
    return (
      <div className="relative flex h-full min-h-0 flex-1 bg-slate-900">
        <PdfPagePreview key={`${blob.size}:${blob.type}`} blob={blob} variant={variant} />
      </div>
    );
  }

  if (blob.type.startsWith("image/")) {
    return <ImageBlobPreview blob={blob} />;
  }

  if (blob.type.startsWith("text/")) {
    return (
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-800">
        <TextBlobPreview blob={blob} />
      </div>
    );
  }

  return null;
}
