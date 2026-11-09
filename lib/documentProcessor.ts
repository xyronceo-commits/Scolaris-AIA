// pdf-parse is loaded lazily: importing it at startup needs DOMMatrix, which crashes the Vercel function on boot.
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

/** Decodes XML entities commonly present in Office Open XML files (DOCX/PPTX) */
function decodeXmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    });
}

/** Extracts plain text from RTF (Rich Text Format) documents */
function extractRtfText(rtfString: string): string {
  if (!rtfString) return '';
  return rtfString
    // Remove font tables, color tables, stylesheets and metadata groups
    .replace(/{\\(fonttbl|colortbl|stylesheet|info|pict)[^}]*}/gi, ' ')
    // Replace paragraph / line break control words
    .replace(/\\(par|line)\b/gi, '\n')
    .replace(/\\tab\b/gi, '\t')
    // Remove hexadecimal character representations (e.g. \'e9)
    .replace(/\\'[0-9a-f]{2}/gi, ' ')
    // Remove all remaining RTF control words (e.g. \b, \i, \fs24, \ul)
    .replace(/\\[a-z]{1,32}(-?\d+)? ?/gi, ' ')
    // Remove remaining braces
    .replace(/[{}]/g, ' ')
    // Normalize spaces
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Decodes text buffer taking into account potential UTF-16 or UTF-8 BOM markers */
function decodeTextBuffer(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return '';

  // Check UTF-16LE BOM: FF FE
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.subarray(2).toString('utf16le');
  }

  // Check UTF-16BE BOM: FE FF
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i < buffer.length - 1; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString('utf16le');
  }

  // Check UTF-8 BOM: EF BB BF
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.subarray(3).toString('utf-8');
  }

  // Heuristic: check if buffer appears to be UTF-16LE without BOM (every 2nd byte is null for ASCII)
  if (buffer.length >= 4) {
    let nullCountAtOdd = 0;
    const checkLen = Math.min(buffer.length, 200);
    for (let i = 1; i < checkLen; i += 2) {
      if (buffer[i] === 0) nullCountAtOdd++;
    }
    if (nullCountAtOdd > (checkLen / 4) * 0.8) {
      return buffer.toString('utf16le');
    }
  }

  return buffer.toString('utf-8');
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
    // Clean up pdf-parse automated page markers (e.g. "-- 1 of 12 --")
    .replace(/\n\s*--\s*\d+\s+of\s+\d+\s*--\s*\n/gi, '\n\n')
    // Replace 2+ spaces or horizontal tabs on a single line with 1 space
    .replace(/[ \t]+/g, ' ')
    // Fix lines that have leading/trailing whitespace
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
        reason: "This PDF appears to be scanned or image-based without selectable text. Text extraction isn't available for this file yet. Please use the Document Scanner tool or upload a text-based document."
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

  // 3. Check for raw OLE2 Compound File markers (legacy .doc)
  if (text.includes('\xD0\xCF\x11\xE0') || text.includes('Word.Document.') || text.includes('Microsoft Word Document')) {
    return {
      isValid: false,
      reason: "Legacy binary document data detected. Please upload .docx or .pdf format."
    };
  }

  // 4. Non-printable control character density check
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

  // 5. Scanned / image-only PDF detection: Check substantive alphanumeric word count
  if (fileTypeHint === 'pdf') {
    // Strip common page marker residual patterns before checking
    const stripped = text.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').trim();
    const words = stripped.match(/[a-zA-Z0-9]{2,}/g) || [];
    if (words.length < 8) {
      return {
        isValid: false,
        isScannedPdf: true,
        reason: "This PDF contains scanned images or slides without selectable text. Text extraction isn't available for this file yet. Please use the Document Scanner tool or upload a text-based document."
      };
    }
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

  // Explicitly detect legacy .doc (Word 97-2003 binary format)
  if (lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
    return {
      success: false,
      extractedText: '',
      error: 'Legacy Microsoft Word (.doc) format is binary and cannot be parsed directly. Please export or save your document as .docx or .pdf and re-upload.',
      fileTypeDetected: 'doc'
    };
  }

  let detectedType = 'txt';
  if (lowerName.endsWith('.pdf') || lowerType.includes('pdf')) {
    detectedType = 'pdf';
  } else if (lowerName.endsWith('.docx') || lowerType.includes('wordprocessingml') || lowerType.includes('docx')) {
    detectedType = 'docx';
  } else if (lowerName.endsWith('.pptx') || lowerType.includes('presentationml') || lowerType.includes('pptx')) {
    detectedType = 'pptx';
  } else if (lowerName.endsWith('.rtf') || lowerType.includes('rtf')) {
    detectedType = 'rtf';
  } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerName.endsWith('.json') || lowerType.includes('text/')) {
    detectedType = 'txt';
  }

  let rawExtracted = '';
  let pageCount: number | undefined = undefined;

  try {
    if (detectedType === 'pdf') {
      let parsedOk = false;

      // 1. Try PDFParse class (pdf-parse v2)
      try {
        let ParserClass: any = null;
        if (!ParserClass || typeof ParserClass !== 'function') {
          const mod = await import('pdf-parse');
          ParserClass = mod.PDFParse || (mod as any).default?.PDFParse || (mod as any).default || mod;
        }

        if (typeof ParserClass === 'function') {
          try {
            const parser = new ParserClass({ data: new Uint8Array(buffer) });
            if (parser && typeof parser.getText === 'function') {
              const textResult = await parser.getText();
              rawExtracted = textResult.text || '';
              pageCount = textResult.pages?.length || textResult.total;
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
        const slideFileName = slideFiles[i];
        const xmlContent = await zip.files[slideFileName].async('string');
        
        // Extract per paragraph (<a:p>) to preserve line breaks and slide structure
        const paragraphMatches = xmlContent.match(/<a:p[\s>].*?<\/a:p>/gs) || [];
        const slideParagraphs: string[] = [];

        for (const pXml of paragraphMatches) {
          const textMatches = pXml.match(/<a:t[^>]*>(.*?)<\/a:t>/gs) || [];
          const lineText = textMatches
            .map(m => decodeXmlEntities(m.replace(/<[^>]+>/g, '')).trim())
            .filter(Boolean)
            .join(' ');
          if (lineText) {
            slideParagraphs.push(lineText);
          }
        }

        // Also check for accompanying speaker notes in notesSlide
        const slideNum = slideFileName.match(/\d+/)?.[0];
        const notesFileName = `ppt/notesSlides/notesSlide${slideNum}.xml`;
        let notesText = '';
        if (zip.files[notesFileName]) {
          const notesXml = await zip.files[notesFileName].async('string');
          const notesMatches = notesXml.match(/<a:t[^>]*>(.*?)<\/a:t>/gs) || [];
          notesText = notesMatches
            .map(m => decodeXmlEntities(m.replace(/<[^>]+>/g, '')).trim())
            .filter(Boolean)
            .join(' ');
        }

        const combinedSlide = slideParagraphs.join('\n');
        if (combinedSlide) {
          let entry = `--- Slide ${i + 1} ---\n${combinedSlide}`;
          if (notesText && notesText.length > 5) {
            entry += `\n[Notes: ${notesText}]`;
          }
          slideTexts.push(entry);
        }
      }
      rawExtracted = slideTexts.join('\n\n');
      pageCount = slideFiles.length;
    } else if (detectedType === 'rtf') {
      const rawRtf = decodeTextBuffer(buffer);
      rawExtracted = extractRtfText(rawRtf);
    } else {
      // Plain text, Markdown, CSV, TSV, JSON
      rawExtracted = decodeTextBuffer(buffer);
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

  for (const rawP of paragraphs) {
    // If a single paragraph is larger than maxChunkLength, split by lines or sentences
    const subParts = rawP.length > maxChunkLength ? rawP.split('\n') : [rawP];

    for (const p of subParts) {
      if ((currentChunk.length + p.length + 2) > maxChunkLength && currentChunk.length > 0) {
        chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
        const overlapText = currentChunk.slice(Math.max(0, currentChunk.length - overlap));
        currentChunk = overlapText + '\n\n' + p;
      } else {
        currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + p;
      }
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
