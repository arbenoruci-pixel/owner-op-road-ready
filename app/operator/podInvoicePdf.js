import {PDFDocument, StandardFonts, rgb} from 'pdf-lib';

export function brokerGross(cents) {
  const amount = typeof cents === 'string' && /^\d+$/.test(cents) ? Number(cents) : cents;
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'Pending rate verification';
  return new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(amount / 100);
}

// This is the carrier's working copy. Only the existing factoring workflow issues a packet.
export async function buildPodInvoiceDraft(draft, {preview = false} = {}) {
  if (!draft?.draft_id || !['pending_review', 'ready'].includes(draft.status)) {
    throw Error('A current invoice draft is required.');
  }
  const pdf = await PDFDocument.create();
  pdf.setTitle('Freight invoice draft · ' + draft.load_number);
  pdf.setAuthor('Narta Express LLC');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(.08, .13, .19), grey = rgb(.28, .34, .40), blue = rgb(.10, .26, .53);
  const width = 516;
  let page, y;

  function addPage() {
    page = pdf.addPage([612, 792]);
    page.drawRectangle({x:0, y:727, width:612, height:65, color:ink});
    page.drawText('NARTA EXPRESS LLC', {x:48, y:751, size:19, font:bold, color:rgb(1,1,1)});
    const badge = preview ? 'TEST  /  DRAFT' : 'DRAFT';
    page.drawText(badge, {x:564 - bold.widthOfTextAtSize(badge,10), y:755, size:10, font:bold, color:rgb(.82,.89,1)});
    page.drawText('Office draft  /  ' + (preview ? 'Fictional staging example' : 'Pending issuance'),
      {x:48, y:35, size:9, font:regular, color:grey});
    y = 689;
  }

  // Keep broker and address spelling intact when a standard PDF font lacks a glyph.
  async function writeParagraph(value, {size = 12, font = regular, color = ink} = {}) {
    const words = String(value).replace(/\s+/g, ' ').trim().split(' ');
    const supported = new Set(font.getCharacterSet());
    const raster = words.some(word => Array.from(word).some(ch => !supported.has(ch.codePointAt(0))));
    const canvas = raster ? document.createElement('canvas') : null;
    const context = canvas?.getContext('2d');
    if (raster && !context) throw Error('This device could not render the original document text.');
    const style = (font === bold ? 'bold ' : '') + (size * 3) + 'px sans-serif';
    if (context) context.font = style;
    const measure = s => raster ? context.measureText(s).width / 3 : font.widthOfTextAtSize(s, size);
    async function line(s) {
      if (y < 78) addPage();
      if (raster) {
        canvas.width = Math.ceil(width * 3);
        canvas.height = Math.ceil((size + 10) * 3);
        context.font = style;
        context.fillStyle = 'rgb(20,33,48)';
        context.textBaseline = 'alphabetic';
        context.fillText(s, 0, size * 3);
        const img = await pdf.embedPng(canvas.toDataURL('image/png'));
        page.drawImage(img, {x:48, y:y-10, width:canvas.width / 3, height:canvas.height / 3});
      } else {
        page.drawText(s, {x:48, y, size, font, color});
      }
      y -= size + 7;
    }
    let row = '';
    for (const word of words) {
      if (row && measure(row + ' ' + word) > width) {
        await line(row);
        row = '';
      }
      if (measure(word) > width) {
        for (const ch of word) {
          if (row && measure(row + ch) > width) {
            await line(row);
            row = '';
          }
          row += ch;
        }
      } else {
        row = row ? row + ' ' + word : word;
      }
    }
    if (row) await line(row);
  }
  async function field(label, value) {
    if (!value) return;
    if (y < 104) addPage();
    await writeParagraph(label, {size:9, font:bold, color:grey});
    await writeParagraph(value);
    y -= 7;
  }

  addPage();
  await writeParagraph('Freight invoice draft', {size:26, font:bold});
  await writeParagraph('nartaexpress@hotmail.com', {size:10, color:grey});
  y -= 18;
  await field('BILL TO', draft.broker_name);
  await field('BROKER LOAD / ORDER', draft.load_number);
  await field('DRAFT REFERENCE', draft.draft_id);
  if (draft.invoice_number) await field('INVOICE REFERENCE ON FILE', draft.invoice_number);
  await field('PICKUP', draft.pickup_address);
  await field('DELIVERY', draft.delivery_address);
  if (y < 140) addPage();
  page.drawLine({start:{x:48,y}, end:{x:564,y}, thickness:1, color:rgb(.81,.85,.9)});
  y -= 25;
  await writeParagraph('Transportation and approved charges', {size:12, color:grey});
  await writeParagraph('Broker gross  ' + brokerGross(draft.gross_cents), {size:19, font:bold, color:blue});
  y -= 8;
  await writeParagraph('Remittance per the FirstLine Funding Group Notice of Assignment on file.', {size:10, color:grey});
  return pdf.save();
}
