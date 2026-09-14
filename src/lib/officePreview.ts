import { apiUrl } from "./apiClient";

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Word/PowerPoint/Excel can't be rendered by pdf.js (or anything else in-browser) --
 * the only way to show a genuine preview of one is to actually run it through
 * LibreOffice, same as the real conversion would. These map a "needs an Office->PDF
 * detour to preview" tool or MIME type to the existing convert-to-PDF endpoint that can
 * do it -- no new backend work, since converting Office to PDF is already exactly what
 * those endpoints do for the real result. */
const SOURCE_PREVIEW_ENDPOINT: Record<string, string> = {
  "word-to-pdf": "/api/v1/convert/word-to-pdf",
  "powerpoint-to-pdf": "/api/v1/convert/powerpoint-to-pdf",
  "excel-to-pdf": "/api/v1/convert/excel-to-pdf",
};

const RESULT_PREVIEW_ENDPOINT: Record<string, string> = {
  [WORD_MIME]: "/api/v1/convert/word-to-pdf",
  [PPTX_MIME]: "/api/v1/convert/powerpoint-to-pdf",
  [XLSX_MIME]: "/api/v1/convert/excel-to-pdf",
};

/** For a tool whose *source* file is Office format (word/powerpoint/excel-to-pdf):
 * which endpoint converts that same source into a PDF for previewing. */
export function sourcePreviewEndpointFor(slug: string): string | null {
  return SOURCE_PREVIEW_ENDPOINT[slug] ?? null;
}

/** For a tool whose *output* is Office format (pdf-to-word/powerpoint/excel): which
 * endpoint converts that produced file back into a PDF for previewing. */
export function resultPreviewEndpointFor(mimeType: string): string | null {
  return RESULT_PREVIEW_ENDPOINT[mimeType] ?? null;
}

/** Runs a file through one of the endpoints above purely to get something previewable
 * back. Failures are swallowed to `null` -- this is a nicety on top of the real
 * conversion, not a critical path, so a broken/corrupt file here should just mean "no
 * preview available" rather than surfacing a confusing second error alongside whatever
 * the main action is already showing. */
export async function fetchOfficePreviewPdf(endpoint: string, file: File | Blob, filename: string): Promise<Blob | null> {
  try {
    const formData = new FormData();
    formData.append("file", file, filename);
    const response = await fetch(apiUrl(endpoint), { method: "POST", body: formData });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.type === "application/pdf" ? blob : null;
  } catch {
    return null;
  }
}
