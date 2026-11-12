import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processDocumentBuffer,
  normalizeExtractedText,
  validateExtractedText,
  chunkDocumentText,
  selectRelevantChunks
} from './documentProcessor';

test('Document Processor: plain text extraction and pagination defaults', async () => {
  const content = 'This is a sample study note for CSC 301 Systems Programming.\nLecture 1: Memory management and pointers.\nPointer arithmetic and stack allocation.';
  const buf = Buffer.from(content, 'utf8');

  const result = await processDocumentBuffer(buf, 'lecture_notes.txt', 'text/plain', {
    pageStart: 1,
    timeBudgetMs: 38000
  });

  assert.equal(result.success, true);
  assert.equal(result.fileTypeDetected, 'txt');
  assert.equal(result.done, true);
  assert.equal(result.nextPage, null);
  assert.match(result.extractedText, /Lecture 1: Memory management/);
});

test('Document Processor: text normalization removes excessive whitespace and control characters', () => {
  const messy = "Line 1   with    extra    spaces\r\n\r\n\r\n\r\nLine 2\0with null\n\n\nLine 3";
  const clean = normalizeExtractedText(messy);
  assert.ok(!clean.includes('\0'));
  assert.ok(!clean.includes('\r'));
  assert.ok(!clean.includes('    '));
  assert.ok(!clean.includes('\n\n\n'));
});

test('Document Processor: validation detects empty PDF as scanned', () => {
  const emptyPdf = '';
  const val = validateExtractedText(emptyPdf, 'pdf');
  assert.equal(val.isValid, false);
  assert.equal(val.isScannedPdf, true);
});

test('Document Processor: validation detects raw binary PDF markers', () => {
  const binaryNoise = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj';
  const val = validateExtractedText(binaryNoise, 'pdf');
  assert.equal(val.isValid, false);
  assert.match(val.reason || '', /raw pdf/i);
});

test('Document Processor: chunkDocumentText and selectRelevantChunks', () => {
  const longText = Array.from({ length: 50 }, (_, i) => `Chapter ${i + 1}: Topic ${i + 1} covers algorithmic complexity O(n log n) and binary search trees in data structures.`).join('\n\n');
  const chunks = chunkDocumentText(longText, 1000, 100);
  assert.ok(chunks.length > 1);

  // Relevant chunk selection
  const relevantText = selectRelevantChunks(longText, 'binary search trees', 15000);
  assert.ok(typeof relevantText === 'string');
  assert.ok(relevantText.length > 0);
  assert.match(relevantText, /binary search trees/i);
});
