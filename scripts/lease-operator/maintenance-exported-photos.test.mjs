import assert from 'node:assert/strict';
import test from 'node:test';
import {readExportedReceiptPhotos} from '../../app/operator/exportedReceiptPhotos.js';
import {photoPagesToPdf} from '../../scripts/v110328/scanIntake.js';

const page = (width,height,data) => ({width,height,file:new Blob([Uint8Array.of(255,216,...data,255,217)],{type:'image/jpeg'})});
const sample = [page(23,49,[255,9,2]),page(90,87,[55,77,95,7])];

test('reopened scan PDFs return the exact JPEGs in page order', async () => {
  const pdf = await photoPagesToPdf(sample);
  const photos = await readExportedReceiptPhotos(pdf);
  assert.equal(photos.length,2);
  for (let i = 0; i < sample.length; i++) {
    assert.equal(photos[i].type,'image/jpeg');
    assert.deepEqual(await photos[i].arrayBuffer(),await sample[i].file.arrayBuffer());
  }
});

test('modified transforms, page overlays, incremental edits and other PDFs keep the ordinary renderer', async () => {
  const original = Buffer.from(await (await photoPagesToPdf(sample)).arrayBuffer());
  const before = original.toString('latin1');
  for (const content of [before.replace('612 0 0','312 0 0'),before.replace('/Im0 Do Q','/Im1 Do Q'),
    before + 'updated revision',before.replace('/Count 2','/Count 9'),'%PDF-1.7 another producer']) {
    assert.equal(await readExportedReceiptPhotos(new Blob([Buffer.from(content,'latin1')])),null);
  }
});
