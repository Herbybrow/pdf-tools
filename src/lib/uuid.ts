/** `crypto.randomUUID()` only exists in a secure context (HTTPS, or the special-cased
 * `localhost`/`127.0.0.1`) -- a LAN IP over plain HTTP is neither, even though that's
 * exactly what Scan to PDF's phone-pairing mode needs (so a phone on the same Wi-Fi
 * can load the page at all). Falls back to a Math.random()-based id when the real API
 * isn't available. These ids are only ever local, ephemeral identifiers -- React keys,
 * session-pairing codes -- never anything security-sensitive, so the fallback's weaker
 * randomness guarantee is an acceptable tradeoff for working outside a secure context. */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
