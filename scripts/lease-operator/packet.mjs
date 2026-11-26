import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {PDFDocument, StandardFonts, rgb} from "pdf-lib";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const money = (cents) => (cents / 100).toLocaleString("en-US", {style: "currency", currency: "USD"});
const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const imageCoders = new Map([["image/jpeg","jpeg"],["image/png","png"],["image/webp","webp"],["image/heic","heic"],["image/heif","heif"]]);

// Decode only the allowed camera image formats with fixed binary/format arguments.
// The archive always retains the source bytes. Orientation and page count are
// taken from the image itself. All frames are rendered, including HEIF sequences.
function convertImage(bytes, coder, mode, index=0) {
  const limits = ["-limit","memory","192MiB","-limit","map","384MiB","-limit","disk","128MiB","-limit","width","24000","-limit","height","24000"];
  const args = mode === "inspect"
    ? ["identify",...limits,"-ping","-format","%w %h\n",coder+":-"]
    : [...limits,coder+":-["+index+"]","-auto-orient","-background","white","-alpha","remove","-colorspace","sRGB","-strip","-quality","92","jpeg:-"];
  const r = spawnSync("magick",args,{input:bytes,maxBuffer:36*1024*1024,timeout:40000});
  if(r.status!==0 || r.error) throw Error("Unable to decode verified "+coder+" original. Review or convert a private copy before submitting.");
  return r.stdout;
}
function imageFrames(bytes,mime) {
  const coder=imageCoders.get(mime);
  if(!coder) throw Error("Unsupported original image format.");
  const rows=convertImage(bytes,coder,"inspect").toString().trim().split("\n");
  if(!rows.length||rows.length>25||rows.some(row=>{
    const [w,h]=row.split(" ").map(Number);
    return !Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w*h>100000000;
  })) throw Error("Unusual image dimensions or frames; review this original.");
  return rows.map((_,i)=>convertImage(bytes,coder,"render",i));
}

// Use a private manifest populated from rr_lease_loads + verified document
// metadata. Each original must retain its own bytes and immutable DB identity.
export async function buildLeaseFactoringPacket(manifest, readOriginal) {
  const {load, invoice, documents} = manifest;
  if (!load?.id || !text(load.broker_name) || !text(load.load_number) || !Number.isSafeInteger(load.gross_cents) || load.gross_cents <= 0)
    throw Error("A verified assigned load and its full broker rate in cents are required.");
  if (!invoice || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(invoice.number) || !/^\d{4}-\d{2}-\d{2}$/.test(invoice.date))
    throw Error("An invoice number and a billing date are required.");
  if (invoice.amount_cents !== load.gross_cents) throw Error("Invoice total must match the current gross rate.");
  if (!Array.isArray(documents) || documents.filter(d => d.kind === "ratecon").length !== 1 || !documents.some(d => d.kind === "pod"))
    throw Error("Provide one current rate confirmation and the signed delivery evidence.");
  const pods = documents.filter(d => d.kind === 'pod');
  if (!load.final_pod_id || pods.length !== 1 || pods[0].id !== load.final_pod_id || pods[0].rejected_at != null || pods[0].source_kind === 'driver_upload' && pods[0].set_as_final !== true)
    throw Error('Only the approved final POD may appear in the factoring packet.');
  const seen = new Set();
  const checksums = new Set();
  for (const doc of documents) {
    if (!doc.id || seen.has(doc.id) || checksums.has(doc.sha256) || doc.load_id !== load.id || doc.is_current !== true || !/^[a-f0-9]{64}$/.test(doc.sha256))
      throw Error("Packet has a duplicate, outdated or unmatched original.");
    if (!["ratecon", "pod", "bol", "supporting"].includes(doc.kind) || doc.kind !== "ratecon" && doc.verified_for_billing !== true)
      throw Error("Review the delivery evidence and approve each supporting attachment.");
    seen.add(doc.id);
    checksums.add(doc.sha256);
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle("Narta Express LLC — Invoice " + invoice.number);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const ink = rgb(.09, .14, .20);
  let y = 737;
  function line(value, size = 12, font = regular) {
    const words = text(value).split(" ");
    let row = "";
    function print() {
      if (y < 54) throw Error("Invoice text exceeds the page. Review billing fields.");
      page.drawText(row, {x: 48, y, size, font, color: ink});
      y -= size + 7;
    }
    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > 512) throw Error("Invoice field is too long.");
      const next = row ? row + " " + word : word;
      if (font.widthOfTextAtSize(next, size) > 512) { print(); row = word; }
      else row = next;
    }
    if (row) print();
  }
  line("NARTA EXPRESS LLC", 23, bold);
  line("MC 871792  |  USDOT 2513324  |  nartaexpress@hotmail.com", 10);
  y -= 16;
  line("Freight invoice " + invoice.number, 18, bold);
  line("Invoice date " + invoice.date);
  line("Bill to " + load.broker_name);
  if (invoice.bill_to_address) line(invoice.bill_to_address);
  line("Broker load / order " + load.load_number);
  if (load.pickup_address) line("Pickup: " + load.pickup_address);
  if (load.delivery_address) line("Delivery: " + load.delivery_address);
  y -= 12;
  line("Transportation and approved charges per attached rate confirmation");
  line("Total due (USD)   " + money(invoice.amount_cents), 17, bold);
  if (invoice.payment_terms) line("Payment terms: " + invoice.payment_terms);
  y -= 10;
  line("Remit to FirstLine Funding Group according to the Notice of Assignment on file.", 11);
  const pages = [];
  const ordered = [...documents].sort((a, b) => Number(b.kind === "ratecon") - Number(a.kind === "ratecon"));
  for (const doc of ordered) {
    const bytes = await readOriginal(doc);
    if (bytes.length !== doc.byte_size || sha256(bytes) !== doc.sha256) throw Error("Original bytes do not match " + doc.id);
    let count;
    if (doc.mime_type === "application/pdf") {
      const source = await PDFDocument.load(bytes);
      count = source.getPageCount();
      if (!count) throw Error("Empty PDF original.");
      const copied = await pdf.copyPages(source, source.getPageIndices());
      for (const p of copied) pdf.addPage(p);
    } else {
      const frames = imageFrames(bytes,doc.mime_type);
      for (const jpeg of frames) {
        const image = await pdf.embedJpg(jpeg);
        const p = pdf.addPage([612,792]);
        const scale = Math.min(592 / image.width, 772 / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        p.drawImage(image, {x:(612-width)/2, y:(792-height)/2, width, height});
      }
      count = frames.length;
    }
    pages.push({id:doc.id, pages:count});
  }
  const bytes = await pdf.save();
  return {bytes, sha256:sha256(bytes), pages, pageCount:pdf.getPageCount()};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [manifestPath, outputPath] = process.argv.slice(2);
  if (!manifestPath || !outputPath) throw Error("Usage: node scripts/lease-operator/packet.mjs manifest.json invoice-packet.pdf");
  const manifest = JSON.parse(await readFile(manifestPath,"utf8"));
  const packet = await buildLeaseFactoringPacket(manifest, doc => readFile(resolve(dirname(resolve(manifestPath)), doc.path)));
  await writeFile(outputPath, packet.bytes, {flag:"wx", mode:0o600});
  console.log(JSON.stringify({sha256:packet.sha256, byte_size:packet.bytes.length, pageCount:packet.pageCount, originals:packet.pages}));
}
