import assert from 'node:assert/strict';
import test from 'node:test';
import {PDFDict, PDFDocument, PDFName, PDFRawStream} from 'pdf-lib';
import {buildPodScanPdf} from '../../app/operator/podScanPdf.js';
import {MAX_PHOTO_PAGES} from '../v110328/scanIntake.js';

// 4 × 6 RGB JPEG. Add a comment byte to distinguish each prepared page.
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAGAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKUAD//Z',
  'base64',
);

function page(number) {
  const bytes = [jpeg.subarray(0, 2), Uint8Array.of(0xff, 0xfe, 0, 3, number), jpeg.subarray(2)];
  return {preview: new File(bytes, 'scan.jpg', {type: 'image/jpeg'}), width: 4, height: 6};
}

test('one photographed POD page becomes a PDF with a safe load-specific name', async () => {
  const pdf = await buildPodScanPdf([page(1)], '../DÉMO : 001/ ');
  assert.equal(pdf.type, 'application/pdf');
  assert.match(pdf.name, /^POD-DEMO-001-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount(), 1);
  const unassigned = await buildPodScanPdf([page(1)]);
  assert.match(unassigned.name, /^POD-\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('the PDF embeds every prepared JPEG byte-for-byte in reviewed order', async () => {
  const inReviewOrder = Array.from({length: MAX_PHOTO_PAGES}, (_, i) => page(MAX_PHOTO_PAGES - i));
  const pdf = await buildPodScanPdf(inReviewOrder);
  const doc = await PDFDocument.load(await pdf.arrayBuffer());
  assert.equal(doc.getPageCount(), inReviewOrder.length);
  for (const [i, pdfPage] of doc.getPages().entries()) {
    const objects = pdfPage.node.Resources().lookup(PDFName.of('XObject'), PDFDict);
    const image = objects.lookup(PDFName.of('Im0'), PDFRawStream);
    assert.deepEqual(Buffer.from(image.getContents()), Buffer.from(await inReviewOrder[i].preview.arrayBuffer()));
  }
});

test('empty or over-limit scans cannot become an incomplete POD attachment', async () => {
  await assert.rejects(buildPodScanPdf([]), /Choose between 1 and/);
  const tooMany = Array.from({length: MAX_PHOTO_PAGES + 1}, (_, i) => page(i));
  await assert.rejects(buildPodScanPdf(tooMany), /Choose between 1 and/);
});
