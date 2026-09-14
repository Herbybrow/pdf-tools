export type Point = { x: number; y: number };

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const augmented = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivotRow][col])) pivotRow = row;
    }
    [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];

    const pivotValue = augmented[col][col];
    if (Math.abs(pivotValue) < 1e-12) continue;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = augmented[row][col] / pivotValue;
      for (let k = col; k <= n; k++) augmented[row][k] -= factor * augmented[col][k];
    }
  }

  return augmented.map((row, i) => row[n] / (row[i] || 1));
}

/** Solves the 8-DOF projective transform mapping each `dst` point to its corresponding `src` point. */
function computeHomographyCoeffs(dst: Point[], src: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: X, y: Y } = dst[i];
    const { x: sx, y: sy } = src[i];
    A.push([X, Y, 1, 0, 0, 0, -X * sx, -Y * sx]);
    b.push(sx);
    A.push([0, 0, 0, X, Y, 1, -X * sy, -Y * sy]);
    b.push(sy);
  }
  return solveLinearSystem(A, b);
}

/**
 * Straightens the quadrilateral region `srcCorners` (TL, TR, BR, BL, in source-canvas
 * pixel coordinates) of `source` into a flat outWidth x outHeight rectangle, via a
 * backward-mapped homography with bilinear sampling. This is the manual/semi-auto
 * "Scan to PDF" perspective correction (no OpenCV.js dependency).
 */
export function warpPerspective(
  source: HTMLCanvasElement,
  srcCorners: [Point, Point, Point, Point],
  outWidth: number,
  outHeight: number,
): HTMLCanvasElement {
  const dstCorners: Point[] = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];
  const [a, bCoef, c, d, e, f, g, h] = computeHomographyCoeffs(dstCorners, srcCorners);

  const srcCtx = source.getContext("2d");
  if (!srcCtx) throw new Error("Could not read the captured image data.");
  const srcData = srcCtx.getImageData(0, 0, source.width, source.height);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) throw new Error("Could not create the output canvas.");
  const outData = outCtx.createImageData(outWidth, outHeight);

  const channelAt = (px: number, py: number, channel: number) => {
    const clampedX = Math.max(0, Math.min(source.width - 1, px));
    const clampedY = Math.max(0, Math.min(source.height - 1, py));
    return srcData.data[(clampedY * source.width + clampedX) * 4 + channel];
  };

  const sample = (x: number, y: number): [number, number, number, number] => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const lerp = (v0: number, v1: number, t: number) => v0 + (v1 - v0) * t;
    const out: [number, number, number, number] = [0, 0, 0, 0];
    for (let ch = 0; ch < 4; ch++) {
      const top = lerp(channelAt(x0, y0, ch), channelAt(x0 + 1, y0, ch), fx);
      const bottom = lerp(channelAt(x0, y0 + 1, ch), channelAt(x0 + 1, y0 + 1, ch), fx);
      out[ch] = lerp(top, bottom, fy);
    }
    return out;
  };

  for (let Y = 0; Y < outHeight; Y++) {
    for (let X = 0; X < outWidth; X++) {
      const denom = g * X + h * Y + 1;
      const sx = (a * X + bCoef * Y + c) / denom;
      const sy = (d * X + e * Y + f) / denom;
      const idx = (Y * outWidth + X) * 4;
      if (sx >= 0 && sx <= source.width - 1 && sy >= 0 && sy <= source.height - 1) {
        const [r, gr, b2, alpha] = sample(sx, sy);
        outData.data[idx] = r;
        outData.data[idx + 1] = gr;
        outData.data[idx + 2] = b2;
        outData.data[idx + 3] = alpha;
      } else {
        outData.data[idx + 3] = 255;
        outData.data[idx] = 255;
        outData.data[idx + 1] = 255;
        outData.data[idx + 2] = 255;
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

/** Simple contrast/brightness boost to make scanned text more legible, applied in place. */
export function applyContrastBoost(canvas: HTMLCanvasElement, contrast = 35, brightness = 8): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampChannel(factor * (data[i] - 128) + 128 + brightness);
    data[i + 1] = clampChannel(factor * (data[i + 1] - 128) + 128 + brightness);
    data[i + 2] = clampChannel(factor * (data[i + 2] - 128) + 128 + brightness);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Warms (positive) or cools (negative) an image by shifting the red/blue channels --
 * there's no native CSS/canvas filter for colour temperature, unlike brightness/
 * contrast/saturation/hue, which all map directly onto ctx.filter. Applied in place. */
export function applyTemperature(canvas: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  if (amount === 0) return canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampChannel(data[i] + amount);
    data[i + 2] = clampChannel(data[i + 2] - amount);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
