import {MAX_PHOTO_PAGES, photoPagesToPdf} from '../../scripts/v110328/scanIntake.js';

const imageHeader = /<< \/Type \/XObject \/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/;
const decoder = new TextDecoder('ascii');

// Our scanner stores an unmodified JPEG on each PDF page. Reopening that PDF
// should read the same pixels the driver reviewed. Only use direct images if
// our writer can reproduce the entire file, including its drawing instructions.
export async function readExportedReceiptPhotos(file) {
  if (!file.size || file.size > 3 * 1024 * 1024) return null;
  const prefix = decoder.decode(await file.slice(0,1024).arrayBuffer());
  if (!prefix.startsWith('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')) return null;
  const count = Number(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+) >>/.exec(prefix)?.[1]);
  if (!(count >= 1 && count <= MAX_PHOTO_PAGES)) return null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const images = [];
  let offset = 0;
  for (let index = 0; index < count; index++) {
    const header = imageHeader.exec(decoder.decode(bytes.subarray(offset,offset + 2048)));
    if (!header) return null;
    const [width,height,length] = header.slice(1).map(Number);
    const start = offset + header.index + header[0].length;
    const end = start + length;
    if (!(width > 0 && height > 0 && width * height <= 32000000 && length > 4 && end < bytes.length)
      || bytes[start] !== 255 || bytes[start+1] !== 216 || bytes[end-2] !== 255 || bytes[end-1] !== 217) return null;
    images.push({file:file.slice(start,end,'image/jpeg'),width,height});
    offset = end;
  }
  const expected = await photoPagesToPdf(images);
  if (expected.size !== bytes.length) return null;
  const encoded = new Uint8Array(await expected.arrayBuffer());
  return bytes.every((byte,index) => byte === encoded[index]) ? images.map(image => image.file) : null;
}
