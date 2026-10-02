/** Extracts the token whether the scanned text is a raw token or a full `/unlock/<token>` URL. */
export function extractQrToken(scanned: string): string {
  const trimmed = scanned.trim();
  const match = trimmed.match(/\/unlock\/([^/?#]+)/);
  return match ? match[1] : trimmed;
}
