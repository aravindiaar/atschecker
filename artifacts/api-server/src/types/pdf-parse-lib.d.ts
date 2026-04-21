declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfData {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
    metadata: unknown;
  }
  function pdfParse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PdfData>;
  export = pdfParse;
}
