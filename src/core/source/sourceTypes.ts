export type SourceSpan = {
  start: number;
  end: number;
};

export function sourceSpanContains(span: SourceSpan, offset: number): boolean {
  return offset >= span.start && offset <= span.end;
}

export function sourceSpanLength(span: SourceSpan): number {
  return Math.max(0, span.end - span.start);
}
