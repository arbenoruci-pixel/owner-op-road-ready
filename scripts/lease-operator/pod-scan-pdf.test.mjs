import assert from 'node:assert/strict';
import test from 'node:test';
import {PDFDict, PDFDocument, PDFName, PDFRawStream} from 'pdf-lib';
import {uploadReviewedPod} from '../../app/operator/podUpload.js';
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

test('a lost upload response retries the reviewed PDF and an edited scan builds the corrected pages', async () => {
  const cache = {current:null};
  const pages = [page(1), page(2)];
  const sent = [];
  let builds = 0;
  async function upload(review) {
    return uploadReviewedPod(cache, review, () => {
      builds++;
      return buildPodScanPdf(review, 'FIXTURE');
    }, async pdf => {
      sent.push(pdf);
      if (sent.length === 1) throw Error('Response lost');
      return pdf;
    });
  }
  await assert.rejects(upload(pages), /Response lost/);
  const retried = await upload(pages);
  assert.equal(retried, sent[0]);
  assert.equal(builds, 1);
  assert.equal((await PDFDocument.load(await retried.arrayBuffer())).getPageCount(), 2);

  const edited = await upload(pages.slice(1));
  assert.notEqual(edited, retried);
  assert.equal(builds, 2);
  assert.equal((await PDFDocument.load(await edited.arrayBuffer())).getPageCount(), 1);
});

test('a failed PDF export never sends a partial document', async () => {
  const cache = {current:null};
  let sends = 0;
  await assert.rejects(uploadReviewedPod(cache, [], () => buildPodScanPdf([]), () => { sends++; }));
  assert.equal(cache.current, null);
  assert.equal(sends, 0);
});
