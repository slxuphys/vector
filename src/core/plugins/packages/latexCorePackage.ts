import type { LatexCommandContext, LatexCommandDefinition, VectorPlugin } from "../pluginTypes";

export const latexCorePackage: VectorPlugin = {
  name: "@vector/latex-core",
  latex: {
    commands: {
      bibliography: {
        arguments: ["required"],
        modes: ["vertical"],
        handler: () => [{ type: "bibliography" }]
      },
      newpage: pageBreakCommand(),
      clearpage: pageBreakCommand(),
      pagebreak: pageBreakCommand(),
      section: sectionCommand(2),
      subsection: sectionCommand(3),
      subsubsection: sectionCommand(4)
    }
  }
};

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
