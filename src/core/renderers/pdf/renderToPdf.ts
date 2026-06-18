import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PagedDisplayList } from "../../display-list/displayTypes";
import { now } from "../../utils/timing";
import { drawPdfShape } from "./pdfShapes";
import { drawPdfText } from "./pdfText";
import { drawPdfMath } from "./pdfMath";
import { drawPdfMathArtifact } from "./pdfMathArtifact";

export async function renderToPdf(layout: PagedDisplayList): Promise<Uint8Array> {
  const start = now();
  const pdf = await PDFDocument.create();

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  for (const displayPage of layout.pages) {
    const page = pdf.addPage([displayPage.width, displayPage.height]);
    for (const object of displayPage.objects) {
      if (object.type === "text") {
        const font = object.fontFamily.includes("Consolas") || object.fontFamily.includes("Monaco")
          ? mono
          : object.bold
            ? bold
            : object.italic
              ? italic
              : regular;
        drawPdfText(page, object, font, displayPage.height);
      } else if (object.type === "math") {
        const drewArtifact = await drawPdfMathArtifact(pdf, page, object, displayPage.height);
        if (!drewArtifact) drawPdfMath(page, object, { regular, italic }, displayPage.height);
      } else {
        drawPdfShape(page, object, displayPage.height);
      }
    }
  }

  const bytes = await pdf.save();
  Object.defineProperty(bytes, "__pdfMs", { value: now() - start, enumerable: false });
  return bytes;
}

export async function downloadPdf(layout: PagedDisplayList, filename: string): Promise<void> {
  const bytes = await renderToPdf(layout);
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const blob = new Blob([data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
