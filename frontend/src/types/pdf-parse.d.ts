declare module 'pdf-parse' {
  interface PDFInfo {
    PDFFormatVersion?: string;
    IsAcroFormPresent?: boolean;
    IsXFAPresent?: boolean;
    Title?: string;
    Author?: string;
    Subject?: string;
    Keywords?: string;
    Creator?: string;
    Producer?: string;
    CreationDate?: string;
    ModDate?: string;
  }

  interface PDFMeta {
    info?: PDFInfo;
    metadata?: Record<string, unknown> | null;
  }

  interface PDFData {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata: Record<string, unknown> | null;
    text: string;
    version: string;
  }

  interface PDFParseOptions {
    pagerender?: (pageData: { pageIndex: number; pageNumber: number }) => string;
    max?: number;
    version?: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: PDFParseOptions): Promise<PDFData>;

  export = pdfParse;
}
