export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function sanitizeUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|#)/i.test(trimmed)) return trimmed;
  return undefined;
}

export function sanitizeImageUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (/^(https?:|blob:|data:(?:image\/(?:png|jpe?g|gif|webp|svg\+xml)|application\/pdf)(?:[;,])|\/|\.{1,2}\/)/i.test(trimmed)) return trimmed;
  if (trimmed && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !trimmed.startsWith("//")) return trimmed;
  return undefined;
}
