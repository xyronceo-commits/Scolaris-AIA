import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';

export interface ExtractionResult {
  success: boolean;
  extractedText: string;
  error?: string;
  isScannedPdf?: boolean;
  fileTypeDetected: string;
  pageCount?: number;
}

export function normalizeExtractedText(text: string): string {
  if (!text) return '';

  return text
    // Remove NULL bytes
    .replace(/\0/g, '')
    // Standardize line endings to \n
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Replace vertical tabs or form feeds with newlines
    .replace(/[\v\f]/g, '\n')
    // Replace 2+ spaces or tabs on a single line with 1 space
    .replace(/[ \t]+/g, ' ')
    // Fix lines that now have leading/trailing whitespace
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Replace 3 or more consecutive newlines with 2 newlines (preserving paragraph breaks)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  isScannedPdf?: boolean;
}

export function validateExtractedText(text: string, fileTypeHint?: string): ValidationResult {
  if (!text || text.trim().length === 0) {
    if (fileTypeHint === 'pdf') {
      return {
        isValid: false,
        isScannedPdf: true,
        reason: "This PDF appears to be scanned or image-based. Text extraction isn't available for this file yet."
      };
    }
    return {
      isValid: false,
      reason: "We couldn't read this document correctly. Please try uploading another copy."
    };
  }

  // 1. Check for raw PDF binary headers/markers
  const rawPdfMarkers = ['%PDF-', '/FlateDecode', 'endstream', 'endobj', '/Type /Page', 'xref\n0 20'];
  let markerMatches = 0;
  for (const marker of rawPdfMarkers) {
    if (text.includes(marker)) markerMatches++;
  }
  if (text.startsWith('%PDF-') || markerMatches >= 2) {
    return {
      isValid: false,
      isScannedPdf: false,
      reason: "We couldn't read this document correctly. Raw PDF data was detected instead of text."
    };
  }

  // 2. Check for raw ZIP / XML binary markers (unparsed DOCX/PPTX)
  if (text.includes('PK\x03\x04') || (text.includes('[Content_Types].xml') && text.includes('word/document.xml'))) {
    return {
      isValid: false,
      reason: "We couldn't read this document correctly. Raw Office archive data was detected instead of text."
    };
  }

  // 3. Non-printable control character density check
  let nonPrintableCount = 0;
  const sampleLength = Math.min(text.length, 2000);
  for (let i = 0; i < sampleLength; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintableCount++;
    }
  }
  if (sampleLength > 0 && (nonPrintableCount / sampleLength) > 0.05) {
    return {
      isValid: false,
      reason: "We couldn't read this document correctly due to binary character corruption."
    };
  }

  return { isValid: true };
}

export async function processDocumentBuffer(
  buffer: Buffer,
  fileName: string,
  fileType: string
): Promise<ExtractionResult> {
  const lowerName = (fileName || '').toLowerCase();
  const lowerType = (fileType || '').toLowerCase();

  let detectedType = 'txt';
  if (lowerName.endsWith('.pdf') || lowerType.includes('pdf')) {
    detectedType = 'pdf';
  } else if (lowerName.endsWith('.docx') || lowerType.includes('wordprocessingml') || lowerType.includes('docx')) {
    detectedType = 'docx';
  } else if (lowerName.endsWith('.pptx') || lowerType.includes('presentationml') || lowerType.includes('pptx')) {
    detectedType = 'pptx';
  } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.csv') || lowerName.endsWith('.json') || lowerType.includes('text/')) {
    detectedType = 'txt';
  }

  let rawExtracted = '';
  let isScannedPdf = false;
  let pageCount: number | undefined = undefined;

  try {
    if (detectedType === 'pdf') {
      let parsedOk = false;

      // 1. Try PDFParse class (pdf-parse v2)
      try {
        let ParserClass: any = PDFParse;
        if (!ParserClass || typeof ParserClass !== 'function') {
          const mod = require('pdf-parse');
          ParserClass = mod.PDFParse || mod.default?.PDFParse || mod.default || mod;
        }

        if (typeof ParserClass === 'function') {
          try {
            const parser = new ParserClass({ data: new Uint8Array(buffer) });
            if (parser && typeof parser.getText === 'function') {
              const textResult = await parser.getText();
              rawExtracted = textResult.text || '';
              pageCount = textResult.pages?.length || (textResult as any).total;
              parsedOk = true;
              if (typeof parser.destroy === 'function') {
                await parser.destroy();
              }
            }
          } catch (classErr) {
            // If instantiation fails, try function call (v1 style)
            const fnResult = await ParserClass(buffer);
            if (fnResult && typeof fnResult.text === 'string') {
              rawExtracted = fnResult.text;
              pageCount = fnResult.numpages;
              parsedOk = true;
            }
          }
        }
      } catch (err) {
        console.warn('PDFParse attempt failed, trying fallback:', err);
      }

      if (!parsedOk) {
        throw new Error('PDF parsing engine unavailable or failed to process document.');
      }
    } else if (detectedType === 'docx') {
      const result = await mammoth.extractRawText({ buffer });
      rawExtracted = result.value || '';
    } else if (detectedType === 'pptx') {
      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));
      
      // Sort slides numerically: slide1.xml, slide2.xml, slide10.xml
      slideFiles.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return numA - numB;
      });

      const slideTexts: string[] = [];
      for (let i = 0; i < slideFiles.length; i++) {
        const xmlContent = await zip.files[slideFiles[i]].async('string');
        // Extract text inside <a:t> tags
        const matches = xmlContent.match(/<a:t[^>]*>(.*?)<\/a:t>/gs) || [];
        const slideText = matches
          .map(m => m.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .join(' ');

        if (slideText) {
          slideTexts.push(`--- Slide ${i + 1} ---\n${slideText}`);
        }
      }
      rawExtracted = slideTexts.join('\n\n');
      pageCount = slideFiles.length;
    } else {
      // Plain text, Markdown, CSV, JSON, Notes
      rawExtracted = buffer.toString('utf-8');
    }
  } catch (err: any) {
    console.error(`Document extraction error for ${fileName} (${detectedType}):`, err);
    return {
      success: false,
      extractedText: '',
      error: `Failed to extract text from ${fileName}. ${err?.message || ''}`,
      fileTypeDetected: detectedType
    };
  }

  const normalized = normalizeExtractedText(rawExtracted);
  const validation = validateExtractedText(normalized, detectedType);

  if (!validation.isValid) {
    return {
      success: false,
      extractedText: '',
      error: validation.reason || "We couldn't read this document correctly. Please try uploading another copy.",
      isScannedPdf: validation.isScannedPdf,
      fileTypeDetected: detectedType
    };
  }

  return {
    success: true,
    extractedText: normalized,
    fileTypeDetected: detectedType,
    pageCount
  };
}

export interface DocumentChunk {
  index: number;
  text: string;
}

export function chunkDocumentText(text: string, maxChunkLength: number = 8000, overlap: number = 500): DocumentChunk[] {
  if (!text || text.length <= maxChunkLength) {
    return [{ index: 0, text: text || '' }];
  }

  const chunks: DocumentChunk[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';
  let chunkIndex = 0;

  for (const p of paragraphs) {
    if ((currentChunk.length + p.length + 2) > maxChunkLength && currentChunk.length > 0) {
      chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
      const overlapText = currentChunk.slice(Math.max(0, currentChunk.length - overlap));
      currentChunk = overlapText + '\n\n' + p;
    } else {
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + p;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
  }

  return chunks;
}

export function selectRelevantChunks(text: string, query: string, maxChars: number = 15000): string {
  if (!text || text.length <= maxChars) return text || '';

  const chunks = chunkDocumentText(text, 6000, 400);
  if (chunks.length === 1) return chunks[0].text;

  const lowerQuery = (query || '').toLowerCase();
  const queryTerms = lowerQuery.split(/\s+/).filter(t => t.length > 2);

  if (queryTerms.length === 0) {
    let combined = '';
    for (const chunk of chunks) {
      if ((combined.length + chunk.text.length) > maxChars) break;
      combined += (combined ? '\n\n' : '') + chunk.text;
    }
    return combined || text.slice(0, maxChars);
  }

  const scored = chunks.map(chunk => {
    const lowerText = chunk.text.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (lowerText.includes(term)) score += 1;
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  let combined = '';
  for (const item of scored) {
    if (combined.length + item.chunk.text.length > maxChars) {
      if (!combined) {
        combined = item.chunk.text.slice(0, maxChars);
      }
      break;
    }
    combined += (combined ? '\n\n--- Section ---\n\n' : '') + item.chunk.text;
  }

  return combined;
}
