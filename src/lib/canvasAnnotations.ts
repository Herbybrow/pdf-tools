import { PDFDocument, PDFFont, PDFImage, StandardFonts, rgb } from "pdf-lib";

export type Annotation =
  | { id: string; type: "text"; page: number; x: number; y: number; width: number; height: number; text: string; fontSize: number; color: string }
  | { id: string; type: "image"; page: number; x: number; y: number; width: number; height: number; dataUrl: string }
  | { id: string; type: "sign"; page: number; x: number; y: number; width: number; height: number; dataUrl: string }
  | { id: string; type: "rect"; page: number; x: number; y: number; width: number; height: number; color: string; strokeWidth: number }
  | { id: string; type: "ellipse"; page: number; x: number; y: number; width: number; height: number; color: string; strokeWidth: number }
  | { id: string; type: "line"; page: number; x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth: number };

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const value = parseInt(clean.length === 6 ? clean : "000000", 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Bakes annotations (in display-pixel coordinates) into the original PDF using pdf-lib,
 * entirely client-side. `pageScale` is display-pixels-per-PDF-point, per page index. */
export async function bakeAnnotationsIntoPdf(
  originalBytes: ArrayBuffer,
  annotations: Annotation[],
  pageScale: number[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  let font: PDFFont | null = null;
  const imageCache = new Map<string, PDFImage>();

  const embedImage = async (dataUrl: string): Promise<PDFImage> => {
    const cached = imageCache.get(dataUrl);
    if (cached) return cached;
    const bytes = dataUrlToBytes(dataUrl);
    const image = dataUrl.startsWith("data:image/jpeg") ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
    imageCache.set(dataUrl, image);
    return image;
  };

  for (const annotation of annotations) {
    const page = pdfDoc.getPage(annotation.page);
    const scale = pageScale[annotation.page] || 1;
    const pageHeight = page.getHeight();

    if (annotation.type === "text") {
      font ??= await pdfDoc.embedFont(StandardFonts.Helvetica);
      const { r, g, b } = hexToRgb01(annotation.color);
      page.drawText(annotation.text, {
        x: annotation.x / scale,
        y: pageHeight - annotation.y / scale - annotation.fontSize,
        size: annotation.fontSize,
        font,
        color: rgb(r, g, b),
        maxWidth: annotation.width / scale,
      });
    } else if (annotation.type === "rect") {
      const { r, g, b } = hexToRgb01(annotation.color);
      page.drawRectangle({
        x: annotation.x / scale,
        y: pageHeight - (annotation.y + annotation.height) / scale,
        width: annotation.width / scale,
        height: annotation.height / scale,
        borderColor: rgb(r, g, b),
        borderWidth: annotation.strokeWidth,
      });
    } else if (annotation.type === "ellipse") {
      const { r, g, b } = hexToRgb01(annotation.color);
      page.drawEllipse({
        x: (annotation.x + annotation.width / 2) / scale,
        y: pageHeight - (annotation.y + annotation.height / 2) / scale,
        xScale: annotation.width / 2 / scale,
        yScale: annotation.height / 2 / scale,
        borderColor: rgb(r, g, b),
        borderWidth: annotation.strokeWidth,
      });
    } else if (annotation.type === "line") {
      const { r, g, b } = hexToRgb01(annotation.color);
      page.drawLine({
        start: { x: annotation.x1 / scale, y: pageHeight - annotation.y1 / scale },
        end: { x: annotation.x2 / scale, y: pageHeight - annotation.y2 / scale },
        color: rgb(r, g, b),
        thickness: annotation.strokeWidth,
      });
    } else {
      const image = await embedImage(annotation.dataUrl);
      page.drawImage(image, {
        x: annotation.x / scale,
        y: pageHeight - (annotation.y + annotation.height) / scale,
        width: annotation.width / scale,
        height: annotation.height / scale,
      });
    }
  }

  return pdfDoc.save();
}
