'use client';

import { vaultBlobV102, vaultDocumentLabelV102 } from './documentVaultV102.js';

const PDF_LIB_URL_V102 = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
let pdfLibPromiseV102 = null;

function text(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function number(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value = 0) { return number(value).toLocaleString('en-US', { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 }); }

function loadScriptV102(src) {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser_required'));
  if (window.PDFLib?.PDFDocument) return Promise.resolve(window.PDFLib);
  if (pdfLibPromiseV102) return pdfLibPromiseV102;
  pdfLibPromiseV102 = new Promise((resolve, reject) => {
    const existing = [...window.document.scripts].find(script => script.src === src);
    const finish = () => window.PDFLib?.PDFDocument ? resolve(window.PDFLib) : reject(new Error('pdf_lib_unavailable'));
    if (existing) {
      if (window.PDFLib?.PDFDocument) return finish();
      existing.addEventListener('load', finish, { once:true });
      existing.addEventListener('error', () => reject(new Error('pdf_lib_load_failed')), { once:true });
      return;
    }
    const script = window.document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = finish;
    script.onerror = () => reject(new Error('pdf_lib_load_failed'));
    window.document.head.appendChild(script);
  }).catch(error => { pdfLibPromiseV102 = null; throw error; });
  return pdfLibPromiseV102;
}

export async function loadPdfLibV102() {
  if (typeof window !== 'undefined' && window.PDFLib?.PDFDocument) return window.PDFLib;
  return loadScriptV102(PDF_LIB_URL_V102);
}

function wrapTextV102(value = '', maxChars = 82) {
  const words = text(value).split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  words.forEach(word => {
    if (!current) { current = word; return; }
    if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
    else { lines.push(current); current = word; }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawLine(page, value, x, y, font, size = 10, color = null) {
  page.drawText(text(value), { x, y, size, font, ...(color ? { color } : {}) });
}

async function drawInvoicePageV102(pdfDoc, invoice = {}, load = {}, profile = {}) {
  const { StandardFonts, rgb } = await loadPdfLibV102();
  const page = pdfDoc.addPage([612, 792]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.06, 0.12, 0.24);
  const blue = rgb(0.10, 0.32, 0.78);
  const gray = rgb(0.38, 0.43, 0.52);
  const light = rgb(0.94, 0.96, 0.99);

  page.drawRectangle({ x:0, y:710, width:612, height:82, color:navy });
  drawLine(page, 'ROAD READY INVOICE', 42, 752, bold, 22, rgb(1,1,1));
  drawLine(page, text(profile.carrierName || load.carrierName || 'Carrier'), 42, 730, regular, 11, rgb(.84,.9,1));
  drawLine(page, text(invoice.invoiceNo || `INV-${load.loadNo || Date.now()}`), 448, 752, bold, 15, rgb(1,1,1));
  drawLine(page, text(invoice.date || new Date().toISOString().slice(0,10)), 470, 730, regular, 10, rgb(.84,.9,1));

  let y = 675;
  drawLine(page, 'FROM', 42, y, bold, 10, blue);
  drawLine(page, 'BILL TO', 325, y, bold, 10, blue);
  y -= 20;
  const fromLines = [profile.carrierName, profile.address, profile.cityStateZip, profile.phone, profile.email, profile.mcNumber ? `MC ${profile.mcNumber}` : '', profile.dotNumber ? `USDOT ${profile.dotNumber}` : ''].filter(Boolean);
  const billLines = [load.broker || invoice.broker || 'Broker / Customer', load.billingAddress || '', load.billingEmail || invoice.billingEmail || ''].filter(Boolean);
  fromLines.slice(0,6).forEach((line,index)=>drawLine(page,line,42,y-(index*16),index===0?bold:regular,index===0?12:9,gray));
  billLines.slice(0,6).forEach((line,index)=>drawLine(page,line,325,y-(index*16),index===0?bold:regular,index===0?12:9,gray));

  y = 545;
  page.drawRectangle({ x:42, y:y-18, width:528, height:34, color:light });
  drawLine(page, 'LOAD / ORDER', 52, y, bold, 9, gray);
  drawLine(page, 'PICKUP', 185, y, bold, 9, gray);
  drawLine(page, 'DELIVERY', 335, y, bold, 9, gray);
  drawLine(page, 'TERMS', 485, y, bold, 9, gray);
  drawLine(page, load.loadNo || load.orderNo || '', 52, y-16, bold, 11, navy);
  drawLine(page, load.origin || load.pickup || '', 185, y-16, regular, 9, navy);
  drawLine(page, load.destination || load.delivery || '', 335, y-16, regular, 9, navy);
  drawLine(page, profile.paymentTerms || invoice.paymentTerms || 'Net 30', 485, y-16, regular, 9, navy);

  y = 460;
  page.drawRectangle({ x:42, y:y, width:528, height:28, color:navy });
  drawLine(page, 'DESCRIPTION', 52, y+9, bold, 10, rgb(1,1,1));
  drawLine(page, 'AMOUNT', 498, y+9, bold, 10, rgb(1,1,1));
  const items = Array.isArray(invoice.items) && invoice.items.length ? invoice.items : [
    { description:`Transportation service · Load ${load.loadNo || load.orderNo || ''}`, amount:number(load.gross || load.total || invoice.total) },
  ];
  y -= 28;
  items.forEach((item,index) => {
    if (index % 2 === 0) page.drawRectangle({ x:42, y:y-8, width:528, height:28, color:light });
    drawLine(page, item.description || 'Transportation service', 52, y, regular, 10, navy);
    drawLine(page, money(item.amount), 500, y, bold, 10, navy);
    y -= 30;
  });

  const subtotal = items.reduce((sum,item)=>sum+number(item.amount),0);
  const deductions = number(invoice.deductions);
  const total = number(invoice.total) || Math.max(0, subtotal - deductions);
  y -= 10;
  drawLine(page, 'Subtotal', 410, y, regular, 10, gray);
  drawLine(page, money(subtotal), 500, y, bold, 10, navy);
  if (deductions) {
    y -= 20;
    drawLine(page, 'Approved deductions', 410, y, regular, 10, gray);
    drawLine(page, `-${money(deductions)}`, 500, y, bold, 10, navy);
  }
  y -= 28;
  page.drawRectangle({ x:400, y:y-8, width:170, height:34, color:blue });
  drawLine(page, 'TOTAL DUE', 412, y+3, bold, 11, rgb(1,1,1));
  drawLine(page, money(total), 495, y+3, bold, 13, rgb(1,1,1));

  const factoring = profile.factoring || {};
  const notes = [
    invoice.notes,
    factoring.enabled ? `Remit payment to ${factoring.company || 'factoring company'}${factoring.email ? ` · ${factoring.email}` : ''}.` : '',
    factoring.noticeOfAssignment,
    `Supporting paperwork: Rate Confirmation, signed BOL/POD and approved accessorial receipts.`,
  ].filter(Boolean).join(' ');
  y = 150;
  drawLine(page, 'PAYMENT & PAPERWORK', 42, y, bold, 10, blue);
  wrapTextV102(notes, 90).slice(0,6).forEach((line,index)=>drawLine(page,line,42,y-18-(index*14),regular,9,gray));
  drawLine(page, 'Generated by Road Ready Owner-Operator OS', 42, 34, regular, 8, gray);
  return { page, total };
}

async function appendVaultDocumentV102(pdfDoc, document = {}) {
  const blob = await vaultBlobV102(document);
  if (!blob) return { added:false, reason:'blob_missing' };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = text(blob.type || document.mime_type).toLowerCase();
  try {
    if (mime.includes('pdf') || /\.pdf$/i.test(text(document.original_file_name))) {
      const source = await pdfDoc.constructor.load(bytes, { ignoreEncryption:true });
      const pages = await pdfDoc.copyPages(source, source.getPageIndices());
      pages.forEach(page => pdfDoc.addPage(page));
      return { added:true, pages:pages.length };
    }
    let image;
    if (mime.includes('png')) image = await pdfDoc.embedPng(bytes);
    else image = await pdfDoc.embedJpg(bytes);
    const page = pdfDoc.addPage([612, 792]);
    const maxW = 548;
    const maxH = 728;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x:(612-width)/2, y:(792-height)/2, width, height });
    return { added:true, pages:1 };
  } catch {
    return { added:false, reason:'unsupported_document' };
  }
}

export function downloadPdfBytesV102(bytes, fileName = 'road-ready.pdf') {
  if (typeof window === 'undefined') return false;
  const blob = new Blob([bytes], { type:'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
  return true;
}

export async function buildInvoicePdfV102({ invoice = {}, load = {}, profile = {}, download = true } = {}) {
  const { PDFDocument } = await loadPdfLibV102();
  const pdfDoc = await PDFDocument.create();
  const result = await drawInvoicePageV102(pdfDoc, invoice, load, profile);
  const bytes = await pdfDoc.save();
  const invoiceNo = text(invoice.invoiceNo || `INV-${load.loadNo || Date.now()}`).replace(/[^a-zA-Z0-9._-]+/g,'-');
  if (download) downloadPdfBytesV102(bytes, `${invoiceNo}.pdf`);
  return { bytes, total:result.total, invoiceNo };
}

export async function buildBillingPacketPdfV102({ invoice = {}, load = {}, profile = {}, documents = [], download = true } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLibV102();
  const pdfDoc = await PDFDocument.create();
  await drawInvoicePageV102(pdfDoc, invoice, load, profile);
  const included = [];
  for (const document of documents) {
    const result = await appendVaultDocumentV102(pdfDoc, document);
    if (result.added) included.push({ id:document.local_id, label:vaultDocumentLabelV102(document), pages:result.pages });
  }
  if (!included.length) {
    const page = pdfDoc.addPage([612,792]);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText('SUPPORTING PAPERWORK', { x:42, y:740, size:18, font:bold, color:rgb(.06,.12,.24) });
    page.drawText('No local document blobs were available. Open Document Vault and confirm the Rate Con, BOL and POD files.', { x:42, y:705, size:10, font:regular, color:rgb(.38,.43,.52), maxWidth:520 });
  }
  const bytes = await pdfDoc.save();
  const loadNo = text(load.loadNo || load.orderNo || 'load').replace(/[^a-zA-Z0-9._-]+/g,'-');
  if (download) downloadPdfBytesV102(bytes, `billing-packet-${loadNo}.pdf`);
  return { bytes, included };
}

export async function buildAuditPacketPdfV102({ title = 'Road Ready Audit Packet', sections = [], documents = [], fileName = 'road-ready-audit.pdf', download = true } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLibV102();
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([612,792]);
  let y = 744;
  page.drawText(text(title), { x:42, y, size:20, font:bold, color:rgb(.06,.12,.24) });
  y -= 28;
  page.drawText(`Created ${new Date().toLocaleString()}`, { x:42, y, size:9, font:regular, color:rgb(.4,.45,.55) });
  y -= 30;
  const nextPage = () => { page = pdfDoc.addPage([612,792]); y = 744; };
  for (const section of sections) {
    if (y < 120) nextPage();
    page.drawText(text(section.title || 'Section'), { x:42, y, size:13, font:bold, color:rgb(.10,.32,.78) });
    y -= 20;
    const lines = Array.isArray(section.lines) ? section.lines : wrapTextV102(section.text || '', 92);
    for (const rawLine of lines) {
      for (const line of wrapTextV102(rawLine, 92)) {
        if (y < 54) nextPage();
        page.drawText(text(line), { x:52, y, size:9, font:regular, color:rgb(.12,.16,.24) });
        y -= 14;
      }
    }
    y -= 12;
  }
  const included = [];
  for (const document of documents) {
    const result = await appendVaultDocumentV102(pdfDoc, document);
    if (result.added) included.push(document.local_id);
  }
  const bytes = await pdfDoc.save();
  if (download) downloadPdfBytesV102(bytes, fileName);
  return { bytes, included };
}
