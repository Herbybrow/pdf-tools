"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, RotateCw, Trash2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { renderPdfThumbnails } from "@/lib/pdfThumbnails";

export type PageLayoutEntry = { source: number; page: number; rotation: number };

type PageArrangerField_Page = { id: string; fileIndex: number; pageIndex: number; rotation: number; thumbnail: string };

type PageArrangerFieldProps = {
  /** All files uploaded to the pipeline, in upload order -- `source` in the emitted
   * layout is the index into this same array, matching what the pipeline sends as
   * `files` to the backend. */
  files: File[];
  onLayoutChange: (layout: PageLayoutEntry[]) => void;
};

/** The same drag-to-arrange page grid Merge PDF's standalone tool uses, adapted to sit
 * inside a Workflow Pipeline "merge" step instead of owning its own file upload -- the
 * pipeline step needs the exact same "which page goes where, and in what rotation"
 * control the standalone tool already has, not just "files get concatenated in upload
 * order" with no say in the matter. Defaults to every page from every file in upload
 * order (identical to the old behavior) so doing nothing here changes nothing. */
export default function PageArrangerField({ files, onLayoutChange }: PageArrangerFieldProps) {
  const { t } = useLanguage();
  const [pages, setPages] = useState<PageArrangerField_Page[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const dragIndex = useRef<number | null>(null);
  const loadedForFiles = useRef<File[] | null>(null);

  useEffect(() => {
    // Only (re)render thumbnails when the actual set of files changes -- not on every
    // parent re-render -- and skip entirely once already loaded for this exact file list.
    // The "already loaded" marker is only set once a load genuinely finishes (below), not
    // eagerly here: React 19's dev-mode double-invoke runs this effect, cleans it up
    // (cancelled=true) then runs it again -- marking the ref before that second run would
    // make it see "already handled" and bail out immediately, permanently stuck on
    // loading=true since the cancelled first run never reached setLoading(false).
    if (loadedForFiles.current === files) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      // One renderPdfThumbnails call per file, all in flight together -- each call
      // already renders that file's own pages concurrently, so with N files this makes
      // rendering roughly as fast as the single slowest file instead of the sum of all of
      // them. Promise.all keeps files in upload order regardless of which one resolves
      // first (the earlier sequential version existed to avoid exactly that kind of
      // reordering, but per-file promises resolved in array order sidestep the problem
      // without giving up the ordering guarantee).
      const results = await Promise.all(
        files.map(async (file, fileIndex) => {
          try {
            const thumbs = await renderPdfThumbnails(file, 0.55);
            return { fileIndex, file, thumbs };
          } catch {
            return { fileIndex, file, thumbs: null };
          }
        }),
      );
      const nextPages: PageArrangerField_Page[] = [];
      const failed: string[] = [];
      for (const { fileIndex, file, thumbs } of results) {
        if (!thumbs) {
          failed.push(file.name);
          continue;
        }
        thumbs.forEach((thumbnail, pageIndex) => {
          nextPages.push({ id: `${fileIndex}-${pageIndex}`, fileIndex, pageIndex, rotation: 0, thumbnail });
        });
      }
      if (!cancelled) {
        loadedForFiles.current = files;
        setPages(nextPages);
        setFailedFiles(failed);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [files]);

  useEffect(() => {
    onLayoutChange(pages.map((p) => ({ source: p.fileIndex, page: p.pageIndex, rotation: p.rotation })));
    // onLayoutChange is a fresh closure every render in the parent; only `pages` should
    // trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  const rotate = (id: string) => setPages((prev) => prev.map((p) => (p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p)));
  const remove = (id: string) => setPages((prev) => prev.filter((p) => p.id !== id));
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

  if (loading) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">{t("merge.renderingPreviews")}</p>;
  }

  return (
    <div>
      {failedFiles.length > 0 && (
        <p className="mb-2 text-xs text-red-600 dark:text-red-400">{t("workflow.arrangerCouldNotRead")}: {failedFiles.join(", ")}</p>
      )}
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t("merge.arrangeHint")}</p>
      <div data-testid="page-arranger-grid" className="grid grid-cols-3 gap-3">
        {pages.map((page, index) => (
          <div
            key={page.id}
            draggable
            onDragStart={() => {
              dragIndex.current = index;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="group relative rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="absolute left-1.5 top-1.5 z-10 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">{index + 1}</div>
            <GripVertical className="absolute right-1.5 top-1.5 z-10 h-3.5 w-3.5 cursor-grab text-gray-400" />
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated canvas data URLs, not a static asset */}
            <img
              src={page.thumbnail}
              alt={`Page ${index + 1}`}
              style={{ transform: `rotate(${page.rotation}deg)` }}
              className="mx-auto h-24 w-auto rounded border border-gray-100 object-contain transition-transform dark:border-slate-600"
            />
            <div className="mt-1 flex items-center justify-center gap-1.5">
              <button type="button" onClick={() => rotate(page.id)} className="rounded p-0.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700" aria-label="Rotate page">
                <RotateCw className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => remove(page.id)} className="rounded p-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" aria-label="Delete page">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
