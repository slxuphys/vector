export function pxToPt(px: number): number {
  return px * 0.75;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
