export type Hyphenator = {
  language: string;
  points(word: string): number[];
};

export function createFallbackHyphenator(language = "und"): Hyphenator {
  return {
    language,
    points: fallbackHyphenationPoints
  };
}

export function fallbackHyphenationPoints(word: string): number[] {
  const normalized = word.replace(/\u00AD/g, "");
  if (normalized.length < 8) return [];
  if (!/^[A-Za-z][A-Za-z'-]*[A-Za-z]$/.test(normalized)) return [];
  if (/https?:|www\.|[@_/\\]/i.test(normalized)) return [];

  const points = new Set<number>();
  const minPrefix = 3;
  const minSuffix = 3;
  const vowels = /[aeiouy]/i;

  for (let index = minPrefix; index <= normalized.length - minSuffix; index += 1) {
    const previous = normalized[index - 1] ?? "";
    const current = normalized[index] ?? "";
    const next = normalized[index + 1] ?? "";
    if (!/[A-Za-z]/.test(previous) || !/[A-Za-z]/.test(current)) continue;

    const vowelToConsonant = vowels.test(previous) && !vowels.test(current);
    const consonantToVowelAfterCluster = !vowels.test(previous) && vowels.test(current) && !vowels.test(next);
    if (vowelToConsonant || consonantToVowelAfterCluster) points.add(index);
  }

  if (!points.size) {
    for (let index = minPrefix + 2; index <= normalized.length - minSuffix; index += 4) {
      points.add(index);
    }
  }

  return [...points].sort((a, b) => a - b);
}
