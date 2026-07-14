export type LatexEnvironmentMatch = {
  name: string;
  index: number;
  end: number;
  source: string;
  body: string;
  options?: string;
};

export type LatexCommandMatch = {
  name: string;
  index: number;
  end: number;
  source: string;
  starred: boolean;
  requiredArguments: string[];
  optionalArguments: string[];
  trailingLabel?: string;
};

export type LatexCommandSyntax = {
  arguments?: Array<"required" | "optional">;
  trailingLabel?: boolean;
};

export function findNextLatexCommand(
  source: string,
  cursor: number,
  definitions: ReadonlyMap<string, LatexCommandSyntax>
): LatexCommandMatch | undefined {
  const commandPattern = /\\([A-Za-z@]+)(\*)?/g;
  commandPattern.lastIndex = cursor;
  let command = commandPattern.exec(source);
  while (command) {
    const definition = definitions.get(command[1].toLowerCase());
    if (definition) {
      const match = readLatexCommandAt(source, command.index, command[1], Boolean(command[2]), command[0].length, definition);
      if (match) return match;
    }
    command = commandPattern.exec(source);
  }
  return undefined;
}

function readLatexCommandAt(
  source: string,
  index: number,
  name: string,
  starred: boolean,
  commandLength: number,
  definition: LatexCommandSyntax
): LatexCommandMatch | undefined {
  let cursor = index + commandLength;
  const requiredArguments: string[] = [];
  const optionalArguments: string[] = [];
  for (const argument of definition.arguments ?? []) {
    const parsed = readDelimitedArgument(source, cursor, argument === "required" ? "{" : "[", argument === "required" ? "}" : "]");
    if (!parsed) {
      if (argument === "optional") continue;
      return undefined;
    }
    cursor = parsed.end;
    (argument === "required" ? requiredArguments : optionalArguments).push(parsed.value);
  }
  let trailingLabel: string | undefined;
  if (definition.trailingLabel) {
    const labelCommand = readNamedRequiredCommand(source, cursor, "label");
    if (labelCommand) {
      trailingLabel = labelCommand.value;
      cursor = labelCommand.end;
    }
  }
  return {
    name,
    index,
    end: cursor,
    source: source.slice(index, cursor),
    starred,
    requiredArguments,
    optionalArguments,
    trailingLabel
  };
}

export function findNextLatexEnvironment(
  source: string,
  cursor: number,
  names: Iterable<string>
): LatexEnvironmentMatch | undefined {
  const accepted = new Set([...names].map((name) => name.toLowerCase()));
  if (accepted.size === 0) return undefined;
  const beginPattern = /\\begin\{([^{}]+)}/g;
  beginPattern.lastIndex = cursor;
  let begin = beginPattern.exec(source);

  while (begin) {
    const name = begin[1];
    if (accepted.has(name.toLowerCase())) {
      const match = readLatexEnvironmentAt(source, begin.index, name, begin[0].length);
      if (match) return match;
    }
    begin = beginPattern.exec(source);
  }
  return undefined;
}

export function readLatexEnvironmentAt(
  source: string,
  index: number,
  name: string,
  beginLength = `\\begin{${name}}`.length
): LatexEnvironmentMatch | undefined {
  let contentStart = index + beginLength;
  const optional = readOptionalArgument(source, contentStart);
  if (optional) contentStart = optional.end;

  const tokenPattern = new RegExp(`\\\\(begin|end)\\{${escapeRegExp(name)}\\}`, "g");
  tokenPattern.lastIndex = contentStart;
  let depth = 1;
  let token = tokenPattern.exec(source);
  while (token) {
    depth += token[1] === "begin" ? 1 : -1;
    if (depth === 0) {
      const end = token.index + token[0].length;
      return {
        name,
        index,
        end,
        source: source.slice(index, end),
        body: source.slice(contentStart, token.index),
        options: optional?.value
      };
    }
    token = tokenPattern.exec(source);
  }
  return undefined;
}

function readOptionalArgument(source: string, start: number): { value: string; end: number } | undefined {
  let cursor = start;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] !== "[") return undefined;
  let depth = 1;
  for (let index = cursor + 1; index < source.length; index += 1) {
    if (source[index] === "[") depth += 1;
    else if (source[index] === "]") depth -= 1;
    if (depth === 0) return { value: source.slice(cursor + 1, index), end: index + 1 };
  }
  return undefined;
}

function readDelimitedArgument(
  source: string,
  start: number,
  open: "{" | "[",
  close: "}" | "]"
): { value: string; end: number } | undefined {
  let cursor = start;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] !== open) return undefined;
  let depth = 1;
  for (let index = cursor + 1; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) depth -= 1;
    if (depth === 0) return { value: source.slice(cursor + 1, index), end: index + 1 };
  }
  return undefined;
}

function readNamedRequiredCommand(
  source: string,
  start: number,
  name: string
): { value: string; end: number } | undefined {
  let cursor = start;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  const prefix = `\\${name}`;
  if (!source.startsWith(prefix, cursor)) return undefined;
  return readDelimitedArgument(source, cursor + prefix.length, "{", "}");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
