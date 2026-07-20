import type { LatexCommandContext, LatexCommandDefinition, VectorPlugin } from "../../api";

export const latexCorePackage: VectorPlugin = {
  metadata: {
    name: "@vector/latex-core",
    version: "0.1.0",
    apiVersion: "1",
    runtimes: ["browser", "node"]
  },
  latex: {
    commands: {
      newpage: pageBreakCommand(),
      clearpage: pageBreakCommand(),
      pagebreak: pageBreakCommand(),
      appendix: appendixCommand(),
      section: sectionCommand(2),
      subsection: sectionCommand(3),
      subsubsection: sectionCommand(4)
    }
  }
};

function appendixCommand(): LatexCommandDefinition {
  return {
    modes: ["vertical" as const],
    handler: () => [{ type: "appendix" as const }]
  };
}

function pageBreakCommand(): LatexCommandDefinition {
  return {
    modes: ["vertical" as const],
    handler: () => [{ type: "pageBreak" as const }]
  };
}

function sectionCommand(level: 2 | 3 | 4): LatexCommandDefinition {
  return {
    arguments: ["required" as const],
    modes: ["vertical" as const],
    trailingLabel: true,
    handler: ({ requiredArguments, trailingLabel, starred, parseInline }: LatexCommandContext) => [{
      type: "heading" as const,
      level,
      children: parseInline(requiredArguments[0] ?? ""),
      label: trailingLabel,
      unnumbered: starred
    }]
  };
}
