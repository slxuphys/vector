export function svgToDataUrl(svg: string): string {
  const nodeBuffer = (globalThis as { Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } } }).Buffer;
  const encoded = typeof nodeBuffer === "undefined"
    ? btoa(unescape(encodeURIComponent(svg)))
    : nodeBuffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}
