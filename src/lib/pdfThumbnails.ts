import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export class PdfPasswordRequiredError extends Error {
  wrongPassword: boolean;
  constructor(wrongPassword: boolean) {
    super(wrongPassword ? "Incorrect password." : "This PDF is password-protected.");
    this.wrongPassword = wrongPassword;
  }
}

export async function renderPdfThumbnails(file: Blob, scale = 0.35, password?: string): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer, password });
  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    if (err instanceof pdfjsLib.PasswordException) {
      throw new PdfPasswordRequiredError(err.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD);
    }
    throw err;
  }
  // Rendering every page concurrently (rather than one at a time) is the single biggest
  // lever here: pdf.js already decodes/parses off the main thread in its own worker, so
  // the per-page cost that's left (rasterizing onto a canvas, then encoding it) overlaps
  // nicely across pages instead of queuing behind each other. Promise.all preserves page
  // order by array index regardless of which one actually finishes first.
  const thumbnails = await Promise.all(
    Array.from({ length: doc.numPages }, async (_, index) => {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      // JPEG instead of PNG: for a thumbnail (not the full-resolution reading view),
      // lossy compression is invisible at this size but encodes noticeably faster and
      // produces a smaller data URL -- PNG's lossless encoding costs real time for no
      // benefit anyone would notice on a 300px-wide preview.
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      page.cleanup();
      return dataUrl;
    }),
  );

  await loadingTask.destroy();
  return thumbnails;
}
