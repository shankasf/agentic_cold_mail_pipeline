import crypto from 'crypto';

export interface ParsedChunk {
  chunkIndex: number;
  textContent: string;
  sourceMeta: Record<string, unknown>;
  hash: string;
}

export interface ParseResult {
  chunks: ParsedChunk[];
  error?: string;
}

// Compute hash for deduplication
function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

// Normalize whitespace
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Split text into chunks of target length (800-1200 chars)
function splitIntoChunks(
  text: string,
  sourceMeta: Record<string, unknown>,
  startIndex: number = 0
): ParsedChunk[] {
  const TARGET_MIN = 800;
  const TARGET_MAX = 1200;
  const chunks: ParsedChunk[] = [];

  const normalized = normalizeWhitespace(text);
  if (!normalized) return chunks;

  let remaining = normalized;
  let chunkIndex = startIndex;

  while (remaining.length > 0) {
    let chunkEnd = Math.min(remaining.length, TARGET_MAX);

    // Try to break at sentence boundary if possible
    if (remaining.length > TARGET_MAX) {
      const sentenceEnd = remaining.substring(TARGET_MIN, TARGET_MAX).search(/[.!?]\s/);
      if (sentenceEnd > 0) {
        chunkEnd = TARGET_MIN + sentenceEnd + 1;
      } else {
        // Try to break at word boundary
        const wordEnd = remaining.substring(TARGET_MIN, TARGET_MAX).lastIndexOf(' ');
        if (wordEnd > 0) {
          chunkEnd = TARGET_MIN + wordEnd;
        }
      }
    }

    const chunkText = remaining.substring(0, chunkEnd).trim();
    if (chunkText) {
      chunks.push({
        chunkIndex,
        textContent: chunkText,
        sourceMeta: { ...sourceMeta, chunkIndex },
        hash: computeHash(chunkText),
      });
      chunkIndex++;
    }
    remaining = remaining.substring(chunkEnd).trim();
  }

  return chunks;
}

// Parse TXT files
export async function parseTxt(buffer: Buffer): Promise<ParseResult> {
  try {
    const text = buffer.toString('utf-8');
    const chunks = splitIntoChunks(text, { type: 'txt' });
    return { chunks };
  } catch (error) {
    return { chunks: [], error: `TXT parse error: ${error}` };
  }
}

// Parse CSV files
export async function parseCsv(buffer: Buffer): Promise<ParseResult> {
  try {
    const text = buffer.toString('utf-8');
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return { chunks: [], error: 'Empty CSV file' };
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const chunks: ParsedChunk[] = [];
    let chunkIndex = 0;

    // Process rows and create text chunks
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      const rowText = headers.map((h, idx) => `${h}: ${values[idx] || ''}`).join(', ');

      if (rowText.trim()) {
        chunks.push({
          chunkIndex,
          textContent: normalizeWhitespace(rowText),
          sourceMeta: { type: 'csv', row: i, headers },
          hash: computeHash(rowText),
        });
        chunkIndex++;
      }
    }

    return { chunks };
  } catch (error) {
    return { chunks: [], error: `CSV parse error: ${error}` };
  }
}

// Parse XLSX files
export async function parseXlsx(buffer: Buffer): Promise<ParseResult> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const chunks: ParsedChunk[] = [];
    let chunkIndex = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

      if (data.length === 0) continue;

      const headers = data[0].map(h => String(h || '').trim());

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.every(cell => !cell)) continue;

        const rowText = headers
          .map((h, idx) => `${h}: ${row[idx] || ''}`)
          .filter(s => !s.endsWith(': '))
          .join(', ');

        if (rowText.trim()) {
          chunks.push({
            chunkIndex,
            textContent: normalizeWhitespace(rowText),
            sourceMeta: { type: 'xlsx', sheet: sheetName, row: i },
            hash: computeHash(rowText),
          });
          chunkIndex++;
        }
      }
    }

    return { chunks };
  } catch (error) {
    return { chunks: [], error: `XLSX parse error: ${error}` };
  }
}

// Parse PDF files
export async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);

    const chunks = splitIntoChunks(data.text, {
      type: 'pdf',
      pages: data.numpages,
    });

    return { chunks };
  } catch (error) {
    return { chunks: [], error: `PDF parse error: ${error}` };
  }
}

// Main parse function that routes to appropriate parser
export async function parseFile(buffer: Buffer, fileType: string): Promise<ParseResult> {
  const type = fileType.toLowerCase();

  if (type === 'txt' || type === 'text/plain') {
    return parseTxt(buffer);
  }

  if (type === 'csv' || type === 'text/csv') {
    return parseCsv(buffer);
  }

  if (type === 'xlsx' || type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return parseXlsx(buffer);
  }

  if (type === 'xls' || type === 'application/vnd.ms-excel') {
    return parseXlsx(buffer);
  }

  if (type === 'pdf' || type === 'application/pdf') {
    return parsePdf(buffer);
  }

  // Try as text for unknown types
  return parseTxt(buffer);
}
