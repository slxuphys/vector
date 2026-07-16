export class BoundedStringCache {
  private readonly values = new Map<string, string>();
  private characterCount = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxCharacters: number
  ) {}

  get(key: string): string | undefined {
    const value = this.values.get(key);
    if (value === undefined) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    const previous = this.values.get(key);
    if (previous !== undefined) this.characterCount -= previous.length;
    this.values.delete(key);
    this.values.set(key, value);
    this.characterCount += value.length;
    while (this.values.size > this.maxEntries || this.characterCount > this.maxCharacters) {
      const oldest = this.values.entries().next().value as [string, string] | undefined;
      if (!oldest) break;
      this.values.delete(oldest[0]);
      this.characterCount -= oldest[1].length;
    }
  }

  get size(): number {
    return this.values.size;
  }
}
