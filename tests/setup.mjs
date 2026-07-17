import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const nativeFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const value = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const match = value.match(/^\/src\/assets\/fonts\/([^?#/]+)(?:[?#].*)?$/);
  if (!match) return nativeFetch(input, init);

  const bytes = await readFile(resolve("src", "assets", "fonts", match[1]));
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Response(body, {
    status: 200,
    headers: { "content-type": "font/otf" }
  });
};
