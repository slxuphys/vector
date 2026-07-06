declare module "../../../../node_modules/harfbuzzjs/dist/harfbuzz.js" {
  const createHarfBuzz: (options?: {
    locateFile?: (path: string, prefix?: string) => string;
    wasmBinary?: ArrayBuffer | Uint8Array;
  }) => Promise<unknown>;

  export default createHarfBuzz;
}
