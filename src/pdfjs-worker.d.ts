declare module "pdfjs-dist/build/pdf.mjs" {
  export { getDocument, GlobalWorkerOptions, VerbosityLevel } from "pdfjs-dist";
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}
