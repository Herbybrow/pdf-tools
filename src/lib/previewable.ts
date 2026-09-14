const PREVIEWABLE_TYPES = ["application/pdf", "text/markdown", "text/plain", "text/csv"];

/** Whether a result blob can be shown inline via DocumentPreview/PreviewModal (our own
 * rendered PDF/image/text view) rather than requiring a download to inspect it. */
export function isPreviewableBlob(blob: Blob): boolean {
  return PREVIEWABLE_TYPES.includes(blob.type) || blob.type.startsWith("image/") || blob.type.startsWith("text/");
}
