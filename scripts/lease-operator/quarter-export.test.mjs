import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { buildQuarterArchive, chicagoDay, coverageDays, csv, fetchRecordOriginal, filingCoverage, getDriverQuarterRecords, isTestReference, phoneZipBudget, planQuarterParts, quarterSourceRows, quarterStart, shiftQuarter, summarizeDriverRecords } from '../../app/operator/quarterExport.js';
import { readStoredZip } from '../v110431/chunkedZip.js';

test('Chicago quarter boundaries, leap year and overlapping ELD copies', () => {
  assert.equal(quarterStart(chicagoDay(new Date('2026-04-01T04:59Z'))),'2026-01-01');
  assert.equal(quarterStart(chicagoDay(new Date('2026-04-01T05:00Z'))),'2026-04-01');
  assert.equal(shiftQuarter('2026-10-01',1),'2027-01-01');
  const evidence = (a,b)=>({kind:'logbook',file_name:'ELD.csv',coverage_start:a,coverage_end:b});
  assert.deepEqual(coverageDays([evidence('2023-12-25','2024-01-02'),evidence('2024-01-02','2024-01-05'),
    evidence(null,null),{...evidence('2024-01-01','2024-03-31'),file_name:null}], '2024-01-01'),{covered:5,calendarDays:91});
});

test('miles, tax-paid power fuel, unknown tax, DEF/reefer, units, and entered expenses stay separate', () => {
  const base={unit:'228',jurisdiction:'IL',record_date:'2026-11-10'};
  const fuel={...base,kind:'fuel',fuel_type:'diesel',fuel_tax_paid:'yes',file_name:'receipt.pdf',gallons:14.101,amount_cents:5000};
  const rows=[
    fuel,{...fuel,fuel_type:'reefer',gallons:2.009,amount_cents:null},{...fuel,fuel_type:'def',gallons:3,amount_cents:null},
    {...fuel,fuel_tax_paid:'unknown',gallons:1.019,amount_cents:null},{...fuel,file_name:null,gallons:1,amount_cents:null},
    {...base,kind:'mileage',miles:8.251,taxable_miles:0},{...base,kind:'mileage',miles:1.749,taxable_miles:null},
    {...fuel,unit:'',amount_cents:null},{...fuel,record_date:'2027-01-01',gallons:9999},
    {...base,kind:'maintenance',amount_cents:1000},{...base,kind:'expense',expense_category:'Tolls',amount_cents:300},
  ];
  const result=summarizeDriverRecords(rows,'2026-10-01');
  assert.deepEqual(result.spending,[['Fuel purchase',5000],['Maintenance',1000],['Tolls',300]]);
  assert.equal(result.ifta.length,2);
  const group=result.ifta.find(r=>r.unit==='228');
  assert.equal(group.miles,10);assert.equal(group.taxable_miles,0);assert.equal(group.missing_taxable_miles,1);
  assert.equal(group.tax_paid_power_gallons,14.101);assert.equal(group.other_or_unverified_gallons,7.028);
  assert.equal(result.ifta.find(r=>!r.unit).tax_paid_power_gallons,null);
  assert.equal(group.fuel_by_type['reefer / tax paid yes'],2.009);
});

test('spreadsheet exports preserve numeric negatives and neutralize formula-bearing text', () => {
  const result=csv(['description','cents'],[{description:'=2+2',cents:-300},{description:'\tcmd',cents:null},{description:'a"b',cents:10}]);
  assert.ok(result.includes(`"'=2+2","-300"`));assert.ok(result.includes(`"'\tcmd",""`));
  assert.ok(result.includes('"a""b","10"'));
});
const bytes=Buffer.from('sealed test evidence');
const checksum=createHash('sha256').update(bytes).digest('hex');
const doc={id:'record',record_date:'2026-11-10',kind:'logbook',file_name:'../evidence.txt',mime_type:'text/plain',
  is_ready:true,byte_size:bytes.length,sha256:checksum,chunk_count:1};
const sources={loads:[{id:'l',load_number:'123',broker_name:'National Test Engineering',gross_cents:10000,operator_share_cents:10000}],legacy:[],statements:[],costs:[{id:'c',amount_cents:550,wallet_document_id:'w'}],
  documents:[{...doc,id:'d',kind:'ratecon',load_id:'l',storage_backend:'database'}],proofs:[{...doc,id:'w',category:'fuel_receipt'}]};
function fixture() {
  const calls=[];
  const client={rpc:async(name,params)=>{calls.push({name,params});return {data:bytes.toString('base64'),error:null};}};
  return {client,calls,operatorId:'op',start:'2026-10-01',owner:true,activity:{canonical_load_count:1,legacy_load_count:0,legacy_review_count:0,gross_cents:10000,operator_share_cents:10000,posted_cost_row_count:1,posted_cost_row_amount_cents:550},records:[doc],sources};
}

test('quarter archive includes real bytes, CSV ledgers, source IDs, checksums and missing evidence', async () => {
  const f=fixture();
  const file=await buildQuarterArchive(f);
  const parts=await readStoredZip(file);
  assert.ok(parts.has('posted-costs.csv'));assert.ok(parts.has('jurisdiction-totals.csv'));
  const originals=[...parts.keys()].filter(p=>p.startsWith('originals/'));
  assert.equal(originals.length,3);
  for (const path of originals) {
    assert.ok(!path.split('/').includes('..'));assert.equal(await parts.get(path).blob.text(),bytes.toString());
  }
  assert.deepEqual(f.calls.map(x=>x.name),['rr_driver_download_evidence','rr_lease_download_chunk','rr_lease_wallet_download_chunk']);
  assert.match(await parts.get('missing-evidence.csv').blob.text(),/"load","l","pod"/);
  assert.ok((await parts.get('originals-manifest.csv').blob.text()).includes(checksum));
  assert.equal(JSON.parse(await parts.get('summary.json').blob.text()).original_count,3);
});

test('changed financial data, corrupted/missing originals and abandoned request abort export', async () => {
  const f=fixture();
  await assert.rejects(buildQuarterArchive({...f,activity:{canonical_load_count:0,legacy_load_count:1}}),/quarter changed/);
  await assert.rejects(fetchRecordOriginal(f.client,{...doc,sha256:'0'.repeat(64)}),/checksum/);
  await assert.rejects(buildQuarterArchive({...f,client:{rpc:async()=>({error:{message:'Missing original'}})}}),/Missing original/);
  await assert.rejects(buildQuarterArchive({...f,activity:{...f.activity,gross_cents:9999}}),/quarter changed/);
  await assert.rejects(buildQuarterArchive({...f,activity:{...f.activity,legacy_review_count:1}}),/quarter changed/);
  await assert.rejects(buildQuarterArchive({...f,activity:{...f.activity,posted_cost_row_amount_cents:551}}),/quarter changed/);
  const c=new AbortController();c.abort();
  await assert.rejects(buildQuarterArchive({...f,signal:c.signal}),e=>e.name==='AbortError');
});

test('test references use explicit prefixes and preserve legitimate names and internal tokens', () => {
  for (const value of [' TEST-W47-0001','demo:807','synthetic#51','Fixture/1','TEST','Test 42'])
    assert.equal(isTestReference(value),true);
  for (const value of ['National Test Engineering','N-TEST-51','Testament Truck','Demos','0042','',null])
    assert.equal(isTestReference(value),false);
});

test('archive plan partitions large quarters and identifies individual oversized evidence without allocating source bytes', () => {
  const f=fixture();
  const record=(id,size)=>({...doc,id,byte_size:size});
  const limit=phoneZipBudget;
  const plan=planQuarterParts([record('a',limit-1),record('b',1),record('c',limit+100),record('d',2)],
    {...f.sources,documents:[record('proof',limit)],proofs:[]});
  assert.deepEqual(plan.parts.map(p=>[p.number,p.bytes,p.files.length]),[[1,limit,2],[2,2,1],[3,limit,1]]);
  assert.deepEqual(plan.manifest.map(m=>[m.id,m.part]),[['a',1],['b',1],['c','individual'],['d',2],['proof',3]]);
  assert.equal(plan.separate[0].row.id,'c');
});

test('numbered ZIPs repeat the same full index, have disjoint actual files and surface a failed part', async () => {
  const f={...fixture(),budget:bytes.length};
  const allOriginals=[];
  let manifest,version;
  for (const partNumber of [1,2,3]) {
    const file=await buildQuarterArchive({...f,partNumber});
    assert.ok(file.name.endsWith('part-'+partNumber+'-of-3.zip'));
    const contents=await readStoredZip(file);
    const summary=JSON.parse(await contents.get('summary.json').blob.text());
    const index=await contents.get('originals-manifest.csv').blob.text();
    assert.equal(summary.original_count,3);assert.equal(summary.originals_in_this_part,1);
    assert.equal(summary.zip_parts,3);assert.equal(summary.zip_part,partNumber);
    if (manifest) {assert.equal(index,manifest);assert.equal(summary.export_id,version);}
    manifest=index;version=summary.export_id;
    allOriginals.push(...[...contents.keys()].filter(k=>k.startsWith('originals/')));
    assert.match(await contents.get('archive-parts.csv').blob.text(),/"3","1",/);
  }
  assert.equal(new Set(allOriginals).size,3);
  await assert.rejects(buildQuarterArchive({...f,partNumber:4}),/available ZIP/);
  await assert.rejects(buildQuarterArchive({...f,partNumber:2,client:{rpc:async()=>({error:true})}}),/retrieve/);
  const loose={...doc,byte_size:bytes.length+1};
  const indexOnly=await readStoredZip(await buildQuarterArchive({...f,records:[loose],sources:{...sources,documents:[],proofs:[]}}));
  assert.equal(JSON.parse(await indexOnly.get('summary.json').blob.text()).individual_originals,1);
  assert.match(await indexOnly.get('originals-manifest.csv').blob.text(),/"individual"/);
});

test('a large driver attachment is reconstructed from indexed 512 KiB chunks and verified', async () => {
  const block=524288, original=Buffer.alloc(4*1024*1024+11,0);
  for(let index=0;index<9;index++) original.fill(index,index*block,Math.min((index+1)*block,original.length));
  const meta={...doc,byte_size:original.length,sha256:createHash('sha256').update(original).digest('hex')};
  const indexes=[];
  const client={rpc:async(name,p)=>{
    assert.equal(name,'rr_driver_download_evidence_chunk');assert.equal(p.p_record_id,doc.id);
    indexes.push(p.p_index);
    return {data:original.subarray(p.p_index*block,(p.p_index+1)*block).toString('base64')};
  }};
  assert.deepEqual(Buffer.from(await (await fetchRecordOriginal(client,meta)).arrayBuffer()),original);
  assert.deepEqual(indexes,[0,1,2,3,4,5,6,7,8]);
  await assert.rejects(fetchRecordOriginal({rpc:async()=>({data:'YWJj'})},meta),/size/);
});

test('filing count uses coverage dates for the quarter actually filed', () => {
  const filed={kind:'ifta_filing',file_name:'Q3.pdf',record_date:'2026-10-15',coverage_start:'2026-07-01',coverage_end:'2026-09-30'};
  const unknown={...filed,coverage_start:null,coverage_end:null};
  assert.deepEqual(filingCoverage([filed,unknown],'2026-07-01'),{overlapping:1,unknown:0});
  assert.deepEqual(filingCoverage([filed,unknown],'2026-10-01'),{overlapping:0,unknown:1});
});

test('account-quarter queries page private records and fetch originals only for eligible loads and receipts', async () => {
  const queries=[];
  const input={
    rr_driver_tool_records:Array.from({length:202},(_,i)=>({id:i})),
    rr_lease_loads:[{id:'a',load_number:'42-TEST',broker_name:'National Test Engineering'},{id:'b',load_number:'TEST-W47'}],
    rr_lease_owner_expenses:[{id:'a',evidence_reference:'invoice:TEST',wallet_document_id:'keep'},
      {id:'b',evidence_reference:'demo:47',wallet_document_id:'skip'}],
  };
  const query=(name)=>{
    const selection={name,args:[]};
    queries.push(selection);
    const builder={};
    for (const method of ['select','eq','in','gte','lt','order','or']) builder[method]=(...args)=>{
      selection.args.push([method,...args]);return builder;
    };
    builder.range=(first,last)=>({data:(input[name] || []).slice(first,last+1)});
    return builder;
  };
  const db={from:query,rpc:query};
  const records=await getDriverQuarterRecords(db,'workspace-1','2026-10-01');
  assert.equal(records.length,202);
  for(const call of queries) {
    assert.ok(call.args.some(a=>a.join(' ')==='eq operator_id workspace-1'));
    assert.ok(call.args.some(a=>a[0]==='or' && a[1].includes('coverage_end.gte.2026-10-01')));
  }
  const result=await quarterSourceRows(db,'workspace-1','2026-10-01',true);
  assert.deepEqual(result.loads.map(r=>r.id),['a']);assert.deepEqual(result.costs.map(r=>r.id),['a']);
  const argsFor=name=>queries.find(q=>q.name===name).args;
  assert.ok(argsFor('rr_lease_documents').some(a=>a[0]==='in' && a[1]==='load_id' && a[2].join()==='a'));
  assert.ok(argsFor('rr_lease_wallet_documents').some(a=>a[0]==='in' && a[1]==='id' && a[2].join()==='keep'));
  for(const table of ['rr_lease_loads','rr_lease_owner_expenses','rr_lease_wallet_documents'])
    assert.ok(argsFor(table).some(a=>a.join(' ')==='eq operator_id workspace-1'));
});
