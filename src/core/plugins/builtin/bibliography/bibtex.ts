export type BibEntry = {
  key: string;
  type: string;
  fields: Record<string, string>;
};

export function parseBibtex(source: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const entryPattern = /@([A-Za-z]+)\s*([({])/g;
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(source))) {
    const close = match[2] === "(" ? ")" : "}";
    const start = entryPattern.lastIndex;
    const end = findBalancedEnd(source, start, match[2], close);
    if (end === -1) continue;
    const body = source.slice(start, end).trim();
    entryPattern.lastIndex = end + 1;
    if (["comment", "string"].includes(match[1].toLowerCase())) continue;
    const separator = body.indexOf(",");
    if (separator === -1) continue;
    const key = body.slice(0, separator).trim();
    if (!key) continue;
    entries.push({
      key,
      type: match[1].toLowerCase(),
      fields: parseFields(body.slice(separator + 1))
    });
  }

  return entries;
}

function findBalancedEnd(source: string, start: number, open: string, close: string): number {
  let depth = 1;
  let quoted = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\" && quoted) {
      index += 1;
      continue;
    }
    if (char === "\"") quoted = !quoted;
    if (quoted) continue;
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return index;
  }
  return -1;
}

function parseFields(source: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let cursor = 0;
  while (cursor < source.length) {
    while (cursor < source.length && /[\s,]/.test(source[cursor])) cursor += 1;
    const keyMatch = /^([A-Za-z][\w-]*)\s*=/.exec(source.slice(cursor));
    if (!keyMatch) break;
    const key = keyMatch[1].toLowerCase();
    cursor += keyMatch[0].length;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    const value = readFieldValue(source, cursor);
    if (!value) break;
    fields[key] = normalizeField(value.value);
    cursor = value.end;
  }
  return fields;
}

function readFieldValue(source: string, start: number): { value: string; end: number } | undefined {
  if (source[start] === "{") {
    const end = findBalancedEnd(source, start + 1, "{", "}");
    return end === -1 ? undefined : { value: source.slice(start + 1, end), end: end + 1 };
  }
  if (source[start] === "\"") {
    let end = start + 1;
    while (end < source.length && source[end] !== "\"") {
      if (source[end] === "\\") end += 1;
      end += 1;
    }
    return end >= source.length ? undefined : { value: source.slice(start + 1, end), end: end + 1 };
  }
  const end = source.slice(start).search(/[,}\n]/);
  return { value: source.slice(start, end === -1 ? source.length : start + end), end: end === -1 ? source.length : start + end };
}

function normalizeField(value: string): string {
  return value
    .replace(/\\([&#_%$])/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
