import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { parseAmazon,parseFirstLine,parseCSV,parseXLSX,reportDate } from '../../lib/rr-lease/report-import.js';
import { INTAKE_SOURCE,makeIntakeProposal } from '../../lib/rr-lease/intake-contract.js';
const header=['Invoice Number','Block ID','Trip ID','Load ID','Start Date','End Date','Route','Operator Type','Equipment','Distance (Mi)','Item Type','Program Type','Base Rate','Fuel Surcharge','Tolls','Detention','TONU','Others','Gross Pay','Comments'];
const line=(trip,load,base,fsc,{block='',status='LOAD - COMPLETED',invoice='TEST-INV',date='Nov 21, 2026',gross=String(Number(base)+Number(fsc)),comment=''}={})=>[invoice,block,trip,load,date,date,'Fixture route','','','',''+status,'',base,fsc,'0','0','0','0',gross,comment];
const rows=[header,line('trip-1','','100','0',{status:'TOUR - COMPLETED'}),line('TRIP-1','leg-1','0','12.34'),line('trip-1','leg-2','0','7.66'),line('','standalone-1','50','5'),line('','standalone-2','0','0',{status:'LOAD - TONU',gross:'0'}),Array(18).fill('').concat('175','')];
const csv=rows=>Buffer.from(rows.map(r=>r.map(c=>'"'+String(c).replaceAll('"','""')+'"').join(',')).join('\r\n'));
function crc32(bytes){let n=0xffffffff;for(const x of bytes){n^=x;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return (n^0xffffffff)>>>0}
function zip(entries){
 const local=[],central=[];let off=0;
 for(const [name,text] of Object.entries(entries)){
  const n=Buffer.from(name),raw=Buffer.from(text),comp=deflateRawSync(raw),crc=crc32(raw);
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(8,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(comp.length,18);l.writeUInt32LE(raw.length,22);l.writeUInt16LE(n.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(comp.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(off,42);
  local.push(l,n,comp);central.push(c,n);off+=l.length+n.length+comp.length;
 }
 const directory=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(Object.keys(entries).length,8);e.writeUInt16LE(Object.keys(entries).length,10);e.writeUInt32LE(directory.length,12);e.writeUInt32LE(off,16);
 return Buffer.concat([...local,directory,e]);
}
const xmlEscape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function col(i){let a='';for(i++;i;i=Math.floor((i-1)/26))a=String.fromCharCode(65+(i-1)%26)+a;return a}
function xlsx(rows,{formula=false,unsafe=false,shared=true}={}){
 const strings=[],indices=new Map();const idx=x=>{if(!indices.has(x)){indices.set(x,strings.length);strings.push(x)}return indices.get(x)};
 const sheet='<?xml version="1.0"?><worksheet><sheetData>'+rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((x,i)=>{
   const ref=col(i)+(ri+1);if(x==='')return '<c r="'+ref+'"/>';
   if(formula&&ri===1&&i===18)return '<c r="'+ref+'"><f>1+1</f><v>100</v></c>';
   if(ri>0&&i>=12&&i<=18&&/^-?\d+(\.\d+)?$/.test(x))return '<c r="'+ref+'"><v>'+x+'</v></c>';
   return shared?'<c r="'+ref+'" t="s"><v>'+idx(x)+'</v></c>':'<c r="'+ref+'" t="inlineStr"><is><t>'+xmlEscape(x)+'</t></is></c>';
 }).join('')+'</row>').join('')+'</sheetData></worksheet>';
 const entries={'xl/workbook.xml':'<workbook><sheets><sheet name="Payment Summary" r:id="rId6"/><sheet name="Payment Details" r:id="rId7"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId6" Target="worksheets/sheet3.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/><Relationship Id="rId7" Target="worksheets/sheet4.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>','xl/worksheets/sheet3.xml':'<worksheet/>','xl/worksheets/sheet4.xml':sheet};
 if(shared)entries['xl/sharedStrings.xml']='<sst>'+strings.map(x=>'<si><t>'+xmlEscape(x)+'</t></si>').join('')+'</sst>';
 if(unsafe)entries['xl/vbaProject.bin']='not allowed';return zip(entries);
}
test('actual Relay-style CSV and shared-string/inline XLSX normalize identical canonical rows',()=>{
 const a=parseAmazon(csv(rows),'csv'),b=parseAmazon(xlsx(rows),'xlsx'),c=parseAmazon(xlsx(rows,{shared:false}),'xlsx');
 assert.deepEqual(a,b);assert.deepEqual(b,c);assert.equal(a.reportTotalCents,17500);assert.equal(a.lineCount,5);assert.equal(a.rows.length,3);
 assert.deepEqual(a.rows.map(x=>[x.trip,x.block,x.load,x.amount_cents,x.status]),[['TRIP-1',null,null,12000,'COMPLETED'],[null,null,'STANDALONE-1',5500,'COMPLETED'],[null,null,'STANDALONE-2',0,'TONU']]);
});
test('duplicate detail lines deduplicate; conflicting line, malformed totals and invalid date fail closed',()=>{
 const a=parseAmazon(csv([...rows.slice(0,-1),rows[1],rows.at(-1)]),'csv');assert.equal(a.reportTotalCents,17500);assert.equal(a.lineCount,5);
 assert.throws(()=>parseAmazon(csv([header,line('T','','100','0'),line('T','','101','0')]),'csv'),/Conflicting/);
 assert.throws(()=>parseAmazon(csv([header,line('T','','100','0',{gross:'99'})]),'csv'),/component/);
 assert.throws(()=>parseAmazon(csv([...rows.slice(0,-1),Array(18).fill('').concat('176','')]),'csv'),/footer/);
 assert.throws(()=>reportDate('2026-02-30'));assert.throws(()=>parseCSV(Buffer.from('"bad')));
});
test('block plus children and multiple invoice identities require review; no inferred driver',()=>{
 const x=parseAmazon(csv([header,line('','','100','0',{block:'BLK'}),line('T','L','50','0',{block:'BLK'})]),'csv');
 assert.equal(x.rows.length,2);assert.ok(x.rows.every(r=>/overlap/.test(r.review_reason)));
 const y=parseAmazon(csv([header,line('T','L1','100','0'),line('T','L2','50','0',{invoice:'OTHER'})]),'csv');assert.ok(y.rows[0].review_reason);
 assert.ok(x.rows.every(r=>!('operator_id' in r)));
});
test('XLSX rejects formulas, macro members, corrupt ZIP and oversized inflate',()=>{
 assert.throws(()=>parseXLSX(xlsx(rows,{formula:true})),/Formula/);
 assert.throws(()=>parseXLSX(xlsx(rows,{unsafe:true})),/Unsafe/);
 let broken=Buffer.from(xlsx(rows));broken[40]^=1;assert.throws(()=>parseXLSX(broken));
 assert.throws(()=>parseXLSX(zip({'xl/workbook.xml':'x'.repeat(16*1024*1024+1)})),/oversized/);
});
test('FirstLine events use canonical identities, exact cents and explicit reversal link',()=>{
 const h=['Event Type','Event ID','Event Date','Amount','Invoice Number','Reverses Event ID'];
 const r=['DEBIT','TX-1','2026-11-26','-20.00','INV-1',''],rev=['REVERSAL','TX-2','2026-11-27','20.00','INV-1','TX-1'];
 const result=parseFirstLine(csv([h,r,r,rev]));assert.deepEqual(result.rows.map(x=>[x.type,x.reference,x.amount_cents,x.reverses]),[['DEBIT','TX-1',-2000,null],['REVERSAL','TX-2',2000,'TX-1']]);
 assert.throws(()=>parseFirstLine(csv([h,r,[...r.slice(0,3),'-21',...r.slice(4)]])),/Conflicting/);
 assert.throws(()=>parseFirstLine(csv([h,[...rev.slice(0,5),'']])),/Invalid/);
});
test('XLSX proposal source is draft and cannot assert verification or assignment',()=>{
 const p=makeIntakeProposal({source:INTAKE_SOURCE.AMAZON_XLSX,sourceRef:'amazon_relay_xlsx:test',attachmentRef:'1',kind:'amazon_report',sha256:'a'.repeat(64),amountCents:17500,status:'POSTED',operatorId:'forged'});
 assert.equal(p.status,'DRAFT');assert.equal(p.requiresVerification,true);assert.equal(p.operatorId,undefined);
});

test('official Relay payment date footer is report metadata, never another payout',()=>{
 const paid=Array(20).fill('');paid[17]='Paid Nov 25, 2026';
 const a=parseAmazon(xlsx([...rows,paid]),'xlsx');
 assert.equal(a.paymentReportedOn,'2026-11-25');assert.equal(a.reportTotalCents,17500);assert.equal(a.rows.length,3);assert.equal(a.issues.length,0);
 assert.equal(a.rows[0].status,'COMPLETED');assert.throws(()=>parseAmazon(csv([...rows,paid,paid]),'csv'),/Multiple Relay payment date/);
 const note=Array(20).fill('');note[17]='Other adjustment requires review';
 const held=parseAmazon(csv([...rows,note]),'csv');assert.equal(held.issues.length,1);assert.equal(held.reportTotalCents,17500);
});
