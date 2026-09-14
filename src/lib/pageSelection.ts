/** Client-side mirror of the backend's page-range syntax (1-based, inclusive, comma-
 * separated, "-" for a span) -- used by PagePickerField so clicking thumbnails and
 * typing a spec stay in sync without a second source of truth. */
export function parsePageListSpec(spec: string, pageCount: number): Set<number> {
  const indices = new Set<number>();
  for (const rawPart of spec.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    if (part.includes("-")) {
      const [a, b] = part.split("-", 2).map((n) => parseInt(n.trim(), 10));
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      const lo = Math.max(1, Math.min(a, b));
      const hi = Math.min(pageCount, Math.max(a, b));
      for (let i = lo; i <= hi; i++) indices.add(i - 1);
    } else {
      const n = parseInt(part, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= pageCount) indices.add(n - 1);
    }
  }
  return indices;
}

/** Inverse of parsePageListSpec: 0-based indices -> a compressed "1-3,5,7-9" spec. */
export function compressToRangeSpec(zeroBasedIndices: Iterable<number>): string {
  const sorted = [...new Set(zeroBasedIndices)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
    if (i < sorted.length) {
      start = current;
      prev = current;
    }
  }
  return parts.join(",");
}

/** Splits a Split-PDF "1-3;4-6;9" ranges spec into its semicolon-separated groups. */
export function parseRangeGroups(spec: string): string[] {
  return spec
    .split(";")
    .map((group) => group.trim())
    .filter(Boolean);
}
