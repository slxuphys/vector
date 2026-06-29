/// <reference types="vite/client" />

declare module "node:fs" {
  export function readFileSync(path: string): Uint8Array;
}

declare module "*?raw" {
  const content: string;
  export default content;
}

declare module "*.woff2?inline" {
  const content: string;
  export default content;
}

declare module "*.ttf?url" {
  const content: string;
  export default content;
}

declare module "*.otf?url" {
  const content: string;
  export default content;
}
