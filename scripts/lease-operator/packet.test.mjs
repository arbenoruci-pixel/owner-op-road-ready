import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {PDFDocument} from "pdf-lib";
import {buildLeaseFactoringPacket} from "./packet.mjs";

async function fixture(){
  const files=new Map(),docs=[];
  for(const [i,kind] of ["ratecon","pod"].entries()){
    const pdf=await PDFDocument.create();
    for(let n=0;n<=i;n++) pdf.addPage();
    const bytes=await pdf.save(),id="doc-"+i;
    files.set(id,bytes);
    docs.push({id,load_id:"load-1",kind,is_current:true,verified_for_billing:true,sha256:createHash("sha256").update(bytes).digest("hex"),byte_size:bytes.length,mime_type:"application/pdf"});
  }
  const manifest={load:{id:"load-1",broker_name:"Example Freight",load_number:"EX-1",gross_cents:250000},invoice:{number:"TEST-1",date:"2026-11-26",amount_cents:250000},documents:docs};
  return {manifest,read:d=>files.get(d.id)};
}
test("packet preserves original pages and bills the full broker amount",async()=>{
  const {manifest,read}=await fixture();
  const packet=await buildLeaseFactoringPacket(manifest,read);
  assert.equal((await PDFDocument.load(packet.bytes)).getPageCount(),4);
  assert.deepEqual(packet.pages.map(p=>p.pages),[1,2]);
  manifest.invoice.amount_cents=230000;
  await assert.rejects(()=>buildLeaseFactoringPacket(manifest,read),/gross/);
});
test("refuses unmatched documents, unclear POD and corrupted attachments",async()=>{
  const {manifest,read}=await fixture(),pod=manifest.documents[1];
  pod.load_id="other";
  await assert.rejects(()=>buildLeaseFactoringPacket(manifest,read),/unmatched/);
  pod.load_id=manifest.load.id;
  pod.verified_for_billing=false;
  await assert.rejects(()=>buildLeaseFactoringPacket(manifest,read),/Review/);
  pod.verified_for_billing=true;
  await assert.rejects(()=>buildLeaseFactoringPacket(manifest,()=>new Uint8Array()),/bytes/);
});

test("renders a phone photo from verified WebP bytes",async()=>{
  const {manifest,read}=await fixture(),doc=manifest.documents[1];
  const convert=spawnSync("magick",["-size","23x43","xc:white","webp:-"]);
  assert.equal(convert.status,0);
  const image=convert.stdout;
  Object.assign(doc,{mime_type:"image/webp",byte_size:image.length,sha256:createHash("sha256").update(image).digest("hex")});
  const result=await buildLeaseFactoringPacket(manifest,d=>d===doc?image:read(d));
  assert.equal(result.pageCount,3);
  const corrupt=Buffer.from("not a webp");
  Object.assign(doc,{byte_size:corrupt.length,sha256:createHash("sha256").update(corrupt).digest("hex")});
  await assert.rejects(()=>buildLeaseFactoringPacket(manifest,d=>d===doc?corrupt:read(d)),/decode/);
});
