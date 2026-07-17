declare module "pdfjs-dist/build/pdf.mjs" {
  export { getDocument, GlobalWorkerOptions, PDFWorker, VerbosityLevel } from "pdfjs-dist";
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline" {
  const PdfJsWorker: {
    new (): Worker;
  };
  export default PdfJsWorker;
}
