type HarfbuzzSubsetExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(data: number, length: number, mode: number, userData: number, destroy: number): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, length: number): number;
  hb_blob_get_length(blob: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_set_add(set: number, codepoint: number): void;
  hb_set_clear(set: number): void;
  hb_set_invert(set: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_unicode_set(input: number): number;
  hb_subset_input_set(input: number, set: number): number;
  hb_subset_input_get_flags(input: number): number;
  hb_subset_input_set_flags(input: number, flags: number): void;
  hb_subset_or_fail(face: number, input: number): number;
};

type HarfbuzzSubsetRuntime = {
  exports: HarfbuzzSubsetExports;
};

type HarfbuzzHeap = Uint8Array<ArrayBufferLike>;

const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_SETS_LAYOUT_FEATURE_TAG = 6;
const HB_SUBSET_FLAGS_NO_LAYOUT_CLOSURE = 0x00000200;

let runtimePromise: Promise<HarfbuzzSubsetRuntime> | undefined;

export async function subsetFontWithHarfbuzz(
  originalFont: Uint8Array,
  text: string,
  options: { noLayoutClosure?: boolean; wasmBytes?: ArrayBuffer | Uint8Array<ArrayBufferLike> } = {}
): Promise<Uint8Array> {
  if (!text) return originalFont;

  const runtime = await loadHarfbuzzSubset(options.wasmBytes);
  const hb = runtime.exports;
  let heap: HarfbuzzHeap = new Uint8Array(hb.memory.buffer);

  const input = hb.hb_subset_input_create_or_fail();
  if (input === 0) throw new Error("hb_subset_input_create_or_fail failed");

  const fontBuffer = hb.malloc(originalFont.byteLength);
  if (fontBuffer === 0) {
    hb.hb_subset_input_destroy(input);
    throw new Error("Could not allocate HarfBuzz font buffer");
  }

  let blob = 0;
  let face = 0;
  let subset = 0;
  let result = 0;

  try {
    heap = refreshHeap(hb, heap);
    heap.set(originalFont, fontBuffer);

    blob = hb.hb_blob_create(
      fontBuffer,
      originalFont.byteLength,
      HB_MEMORY_MODE_WRITABLE,
      0,
      0
    );
    face = hb.hb_face_create(blob, 0);
    hb.hb_blob_destroy(blob);
    blob = 0;

    const layoutFeatures = hb.hb_subset_input_set(input, HB_SUBSET_SETS_LAYOUT_FEATURE_TAG);
    hb.hb_set_clear(layoutFeatures);
    hb.hb_set_invert(layoutFeatures);

    if (options.noLayoutClosure) {
      hb.hb_subset_input_set_flags(
        input,
        hb.hb_subset_input_get_flags(input) | HB_SUBSET_FLAGS_NO_LAYOUT_CLOSURE
      );
    }

    const inputUnicodes = hb.hb_subset_input_unicode_set(input);
    for (const char of text) {
      hb.hb_set_add(inputUnicodes, char.codePointAt(0) ?? 0);
    }

    subset = hb.hb_subset_or_fail(face, input);
    if (subset === 0) throw new Error("hb_subset_or_fail failed");

    result = hb.hb_face_reference_blob(subset);
    const offset = hb.hb_blob_get_data(result, 0);
    const byteLength = hb.hb_blob_get_length(result);
    if (offset === 0 || byteLength === 0) throw new Error("HarfBuzz returned an empty subset font");

    heap = refreshHeap(hb, heap);
    return new Uint8Array(heap.slice(offset, offset + byteLength));
  } finally {
    if (result) hb.hb_blob_destroy(result);
    if (subset) hb.hb_face_destroy(subset);
    if (face) hb.hb_face_destroy(face);
    if (blob) hb.hb_blob_destroy(blob);
    hb.hb_subset_input_destroy(input);
    hb.free(fontBuffer);
  }
}

async function loadHarfbuzzSubset(wasmBytes?: ArrayBuffer | Uint8Array<ArrayBufferLike>): Promise<HarfbuzzSubsetRuntime> {
  if (wasmBytes) {
    const module = await WebAssembly.instantiate(toArrayBuffer(wasmBytes), {});
    return { exports: module.instance.exports as HarfbuzzSubsetExports };
  }

  runtimePromise ??= (async () => {
    const response = await fetch(harfbuzzSubsetWasmUrl);
    if (!response.ok) throw new Error(`Could not load HarfBuzz subset WASM: ${harfbuzzSubsetWasmUrl}`);
    const module = await WebAssembly.instantiate(await response.arrayBuffer(), {});
    return { exports: module.instance.exports as HarfbuzzSubsetExports };
  })();
  return runtimePromise;
}

function refreshHeap(hb: HarfbuzzSubsetExports, heap: HarfbuzzHeap): HarfbuzzHeap {
  return heap.buffer === hb.memory.buffer ? heap : new Uint8Array(hb.memory.buffer);
}

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array<ArrayBufferLike>): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
import harfbuzzSubsetWasmUrl from "../../../../node_modules/subset-font/node_modules/harfbuzzjs/hb-subset.wasm?url";
