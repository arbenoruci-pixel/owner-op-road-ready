import { MAX_PHOTO_PAGES, photoPagesToPdf } from '../../scripts/v110328/scanIntake.js';

const MAX_PDF_BYTES = 3 * 1024 * 1024;
const TOO_LARGE = 'The complete POD exceeds 3 MiB. Retake photos against a plain background in good light or choose a smaller PDF containing all pages.';
const EXPORT_SETTINGS = [
  { longEdge: 3000, quality: .91 },
  { longEdge: 2400, quality: .84 },
  { longEdge: 1950, quality: .8 },
  { longEdge: 1550, quality: .76 },
];

async function fitPage(page, budget) {
  if (page.file.size <= budget) return page;

  const url = URL.createObjectURL(page.file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  let best = page;
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('This page could not be opened. Retake it and try again.'));
      image.src = url;
    });
    const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
    for (const setting of EXPORT_SETTINGS) {
      const scale = Math.min(1, setting.longEdge / longEdge);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Could not prepare the PDF on this device. Choose an existing PDF instead.');
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const file = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', setting.quality));
      if (file?.type === 'image/jpeg' && file.size > 0 && file.size < best.file.size) {
        best = { file, width: canvas.width, height: canvas.height };
      }
      if (best.file.size <= budget) break;
    }
    return best;
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}

export async function buildPodScanPdf(pages, loadLabel = '') {
  if (!pages.length || pages.length > MAX_PHOTO_PAGES) {
    throw new Error(`Choose between 1 and ${MAX_PHOTO_PAGES} pages for this POD.`);
  }
  const images = pages.map(({ preview, width, height }) => {
    if (preview?.type !== 'image/jpeg' || !preview.size ||
        !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error('A scan is missing its image. Retake the page and try again.');
    }
    return { file: preview, width, height };
  });
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const loadNumber = String(loadLabel ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-/, '').slice(0, 48).replace(/-$/, '');
  const name = ['POD', loadNumber, date].filter(Boolean).join('-') + '.pdf';
  if (images.reduce((total, page) => total + page.file.size, 0) <= MAX_PDF_BYTES) {
    const pdf = await photoPagesToPdf(images, name);
    if (pdf.size <= MAX_PDF_BYTES) return pdf;
  }

  // Small originals keep their bytes. Their unused budget goes to denser pages.
  const order = images.map((_, i) => i).sort((a, b) => images[a].file.size - images[b].file.size);
  const pdfOverhead = 16 * 1024; // Reserve room for PDF objects and the xref.
  let remaining = MAX_PDF_BYTES - pdfOverhead;
  for (const [position, index] of order.entries()) {
    const budget = Math.floor(remaining / (order.length - position));
    const page = await fitPage(images[index], budget);
    images[index] = page;
    remaining -= page.file.size;
    if (remaining < -pdfOverhead) throw new Error(TOO_LARGE);
  }
  const pdf = await photoPagesToPdf(images, name);
  if (pdf.size > MAX_PDF_BYTES) throw new Error(TOO_LARGE);
  return pdf;
}
