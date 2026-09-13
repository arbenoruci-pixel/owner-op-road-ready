export const MAX_PHOTO_PAGES = 8;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const FULL_PAGE = Object.freeze([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif';
export const FILE_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,text/plain,text/csv,.pdf,.txt,.csv';

export function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Document reading cancelled', 'AbortError');
}
export function monotonicProgress(callback = () => {}) {
  let highest = 0;
  return (value, message) => {
    highest = Math.max(highest, Math.min(1, Number(value) || 0));
    callback(highest, message);
  };
}
export async function normalizeScanFile(file) {
  if (!file?.size) throw new Error('This file is empty. Choose another copy.');
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Choose a file smaller than 25 MB.');
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  let type = '';
  if (ascii.startsWith('%PDF-')) type = 'application/pdf';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) type = 'image/jpeg';
  else if (bytes[0] === 137 && ascii.slice(1,4) === 'PNG') type = 'image/png';
  else if (ascii.startsWith('RIFF') && ascii.slice(8,12) === 'WEBP') type = 'image/webp';
  else if (ascii.slice(4,8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1|avif|avis/.test(ascii.slice(8))) type = /avif|avis/.test(ascii) ? 'image/avif' : 'image/heic';
  else if (/\.(txt|csv)$/i.test(file.name || '') && !bytes.some(byte => byte === 0) && !/image|pdf/i.test(file.type || '')) type = /\.csv$/i.test(file.name) ? 'text/csv' : 'text/plain';
  if (!type) throw new Error('Choose a photo, PDF, TXT or CSV file. This file format could not be opened.');
  return file.type === type ? file : new File([file],file.name,{type,lastModified:file.lastModified});
}
export function validateSelection(current, incoming) {
  if (!incoming.length) return;
  const combined = [...current,...incoming];
  const images = combined.every(file => file.type.startsWith('image/'));
  if (!images && combined.length > 1) throw new Error('Keep one document per scan. Remove the current pages before choosing a PDF or another file.');
  if (images && combined.length > MAX_PHOTO_PAGES) throw new Error(`Choose up to ${MAX_PHOTO_PAGES} photos for one document. No pages were added.`);
  if (combined.reduce((size,file) => size + file.size,0) > MAX_DOCUMENT_BYTES) throw new Error('The selected document is over 25 MB. Choose smaller photos or a smaller PDF.');
}
export function movePage(pages, id, direction) {
  const from = pages.findIndex(page => page.id === id), to = from + direction;
  if (from < 0 || to < 0 || to >= pages.length) return pages;
  const next = [...pages];
  [next[from],next[to]] = [next[to],next[from]];
  return next;
}
export function validCorners(points) {
  if (!Array.isArray(points) || points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return false;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
    if ((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x) <= .0001) return false;
    area += a.x*b.y-b.x*a.y;
  }
  return area / 2 >= .05;
}

// Embed each JPEG unchanged on its own PDF page. Offsets are byte counts, not
// string lengths, so binary data and non-ASCII filenames cannot corrupt xref.
export async function photoPagesToPdf(pages, name = 'scanned-document.pdf') {
  if (!pages.length) throw new Error('Add a page first.');
  const encoder = new TextEncoder(), chunks=[], offsets=[0]; let length=0;
  const append = value => {const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);length+=bytes.length;};
  const object = (id, parts) => {offsets[id]=length;append(`${id} 0 obj\n`);for(const part of parts)append(part);append('\nendobj\n');};
  append('%PDF-1.4\n');
  object(1,['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2,[`<< /Type /Pages /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] /Count ${pages.length} >>`]);
  for(let i=0;i<pages.length;i++) {
    const {file,width,height}=pages[i];
    if(file.type!=='image/jpeg'||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('A document page could not be prepared.');
    const id=3+i*3,w=612,h=+(w*height/width).toFixed(3),bytes=new Uint8Array(await file.arrayBuffer());
    const draw=`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;
    object(id,[`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`]);
    object(id+1,[`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,bytes,'\nendstream']);
    object(id+2,[`<< /Length ${encoder.encode(draw).length} >>\nstream\n${draw}endstream`]);
  }
  const xref=length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset=>append(`${String(offset).padStart(10,'0')} 00000 n \n`));
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  if(length>MAX_DOCUMENT_BYTES)throw new Error('The finished document is over 25 MB. Remove a page or use smaller photos.');
  return new File(chunks,name,{type:'application/pdf'});
}
