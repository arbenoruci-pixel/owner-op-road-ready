import { allRows, loadOriginal } from './portalData.js';
import { ChunkedZip, inspectBlob, sha256 } from '../../scripts/v110431/chunkedZip.js';

export const recordLabels = {
  maintenance: 'Maintenance', expense: 'Expense', mileage: 'Jurisdiction miles', fuel: 'Fuel purchase',
  logbook: 'ELD / logbook copy', ifta_filing: 'IFTA filing proof', audit_document: 'Audit document',
};
const recordFields = 'id,operator_id,record_date,coverage_start,coverage_end,kind,unit,description,amount_cents,odometer,next_service_odometer,next_service_date,jurisdiction,miles,taxable_miles,gallons,fuel_type,fuel_tax_paid,vendor,expense_category,file_name,mime_type,byte_size,sha256';
const documentFields = 'id,file_name,mime_type,sha256,byte_size,chunk_count,is_ready';
const fmt = (value) => String(value).padStart(2, '0');
export function chicagoDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago', year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get = (field) => parts.find((p) => p.type === field).value;
  return [get('year'),get('month'),get('day')].join('-');
}
export function quarterStart(day) {
  return day.slice(0,4) + '-' + fmt(1 + 3 * Math.floor((Number(day.slice(5,7)) - 1) / 3)) + '-01';
}
export function shiftQuarter(start, count) {
  const next = new Date(start + 'T12:00:00Z');
  next.setUTCMonth(next.getUTCMonth() + count * 3);
  return next.toISOString().slice(0,10);
}
export function quarterTitle(start) {
  return 'Q' + (1 + Math.floor((Number(start.slice(5,7)) - 1) / 3)) + ' ' + start.slice(0,4);
}
export function getDriverQuarterRecords(client, operatorId, start) {
  const end = shiftQuarter(start, 1);
  return allRows(() => client.from('rr_driver_tool_records').select(recordFields)
    .eq('operator_id',operatorId)
    .or('and(record_date.gte.' + start + ',record_date.lt.' + end + '),and(coverage_start.lt.' + end + ',coverage_end.gte.' + start + ')')
    .order('record_date').order('id'));
}
export function summarizeDriverRecords(records, start) {
  const ifta = new Map(), spending = new Map();
  const end = shiftQuarter(start, 1);
  for (const r of records) {
    if (r.record_date < start || r.record_date >= end) continue;
    if (['maintenance','fuel','expense'].includes(r.kind) && r.amount_cents != null) {
      const category = r.kind === 'expense' ? r.expense_category || 'Other expense' : recordLabels[r.kind];
      spending.set(category, (spending.get(category) || 0) + r.amount_cents);
    }
    if (r.kind !== 'mileage' && r.kind !== 'fuel') continue;
    const unit = (r.unit || '').trim().toUpperCase(), jurisdiction = (r.jurisdiction || '').trim().toUpperCase();
    const key = JSON.stringify([unit,jurisdiction]);
    const group = ifta.get(key) || {unit,jurisdiction,miles:null,taxable_miles:null,
      missing_taxable_miles:0, fuel_by_type:{}, tax_paid_power_gallons:null, other_or_unverified_gallons:null};
    const add = (target, key, amount) => { target[key] = Math.round(((target[key] || 0) + Number(amount)) * 1000) / 1000; };
    if (r.kind === 'mileage') {
      add(group,'miles',r.miles);
      if (r.taxable_miles == null) group.missing_taxable_miles++;
      else add(group,'taxable_miles',r.taxable_miles);
    } else {
      const type = r.fuel_type || 'unknown', tax = r.fuel_tax_paid || 'unknown';
      const breakdown = type + ' / tax paid ' + tax;
      add(group.fuel_by_type,breakdown,r.gallons);
      const documented = ['diesel','gasoline','biodiesel'].includes(type) && tax==='yes' && r.file_name && unit && jurisdiction;
      add(group,documented ? 'tax_paid_power_gallons' : 'other_or_unverified_gallons',r.gallons);
    }
    ifta.set(key, group);
  }
  return {
    ifta: [...ifta.values()].sort((a,b) => a.unit.localeCompare(b.unit) || a.jurisdiction.localeCompare(b.jurisdiction)),
    spending: [...spending].sort(([a],[b]) => a.localeCompare(b)),
  };
}
const dayNumber = (date) => Date.parse(date + 'T00:00:00Z') / 86400000;
export function coverageDays(records, start) {
  const first = dayNumber(start), end = dayNumber(shiftQuarter(start,1)), days = new Set();
  for (const r of records) {
    if (r.kind !== 'logbook' || !r.file_name || !r.coverage_start || !r.coverage_end) continue;
    for (let d = Math.max(dayNumber(r.coverage_start), first); d <= Math.min(dayNumber(r.coverage_end),end-1); d++) days.add(d);
  }
  return { covered:days.size, calendarDays:end-first };
}
export function filingCoverage(records,start) {
  const end = shiftQuarter(start,1);
  const copies = records.filter(r=>r.kind==='ifta_filing' && r.file_name);
  return {
    overlapping:copies.filter(r=>r.coverage_start && r.coverage_start<end && r.coverage_end>=start).length,
    unknown:copies.filter(r=>!r.coverage_start && r.record_date>=start && r.record_date<end).length,
  };
}
export function csv(columns, rows) {
  const encode = (v) => {
    let s = String(v ?? '');
    // Protect spreadsheet users when imported text begins with a formula.
    if (typeof v === 'string' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"','""') + '"';
  };
  return [columns, ...rows.map((row) => columns.map((key) => row[key]))].map((r) => r.map(encode).join(',')).join('\r\n') + '\r\n';
}
function rpcValue(result) {
  if (result.error) throw new Error(result.error.message || 'Could not read the quarter.');
  return result.data;
}
const recordChunk = 512 * 1024;
export async function fetchRecordOriginal(client, record, signal) {
  const size = record.byte_size;
  if (!record.file_name || !Number.isSafeInteger(size) || size < 1 || size > 32 * 1024 * 1024)
    throw new Error('Invalid saved original size.');
  const large = size > 4 * 1024 * 1024;
  const parts = [];
  for (let index = 0; index < (large ? Math.ceil(size / recordChunk) : 1); index++) {
    signal?.throwIfAborted();
    const result = large
      ? await client.rpc('rr_driver_download_evidence_chunk',{p_record_id:record.id,p_index:index})
      : await client.rpc('rr_driver_download_evidence',{p_record_id:record.id});
    const data = rpcValue(result);
    if (typeof data !== 'string') throw new Error('Missing saved original.');
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    if (bytes.length !== (large ? Math.min(recordChunk, size - index * recordChunk) : size))
      throw new Error('Original size differs from its saved record.');
    parts.push(bytes);
  }
  signal?.throwIfAborted();
  const blob = new Blob(parts,{type:record.mime_type || 'application/octet-stream'});
  if (await sha256(await blob.arrayBuffer()) !== record.sha256) throw new Error('Original checksum differs from its saved record.');
  return blob;
}
async function batched(ids, query) {
  const unique = [...new Set(ids.filter(Boolean))], rows = [];
  for (let at = 0; at < unique.length; at += 40) {
    const part = unique.slice(at, at + 40);
    rows.push(...await allRows(() => query(part).order('id')));
  }
  return rows;
}
export const isTestReference = value => /^(test|demo|fixture|synthetic)(?:$|[-_: /#])/i.test(String(value || '').trim());
export async function quarterSourceRows(client, operatorId, start, owner) {
  const end = shiftQuarter(start,1);
  const loadsQuery = () => client.from('rr_lease_loads')
    .select('id,load_number,broker_name,actual_delivery_date,gross_cents,operator_share_cents,carrier_share_cents')
    .eq('operator_id',operatorId).in('status',['delivered','closed'])
    .gte('actual_delivery_date',start).lt('actual_delivery_date',end).order('id');
  const [allLoads, legacy, statements] = await Promise.all([
    allRows(loadsQuery),
    owner ? allRows(() => client.rpc('rr_driver_quarter_legacy_loads',{p_operator_id:operatorId,p_start:start}).order('delivery_date').order('legacy_key')) : [],
    owner ? [] : allRows(() => client.from('rr_lease_settlements').select('id,week_start,status')
      .eq('operator_id',operatorId).gte('week_start',start).lt('week_start',end).order('id')),
  ]);
  const loads=allLoads.filter(l=>!isTestReference(l.load_number));
  const allCosts = owner
    ? await allRows(() => client.from('rr_lease_owner_expenses')
      .select('id,purchased_on,kind,description,amount_cents,evidence_reference,wallet_document_id')
      .eq('operator_id',operatorId).gte('purchased_on',start).lt('purchased_on',end).order('id'))
    : await batched(statements.map(s=>s.id), ids=>client.from('rr_lease_adjustments')
      .select('id,settlement_id,kind,paid_by,description,amount_cents,settlement_effect_cents,evidence_reference,wallet_document_id')
      .eq('operator_id',operatorId).in('settlement_id',ids));
  const costs=allCosts.filter(c=>!isTestReference(c.evidence_reference));
  const [documents, proofs] = await Promise.all([
    batched(loads.map(l=>l.id),ids=>client.from('rr_lease_documents')
      .select(documentFields + ',load_id,kind,storage_backend,storage_path,revision,is_current')
      .in('load_id',ids).eq('is_ready',true)),
    batched(costs.map(c=>c.wallet_document_id),ids=>client.from('rr_lease_wallet_documents')
      .select(documentFields + ',category,revision').eq('operator_id',operatorId).eq('is_ready',true).in('id',ids)),
  ]);
  return {loads, legacy, costs, statements, documents, proofs};
}
const safeFile = (name) => String(name).replace(/[^a-zA-Z0-9_.-]/g,'_').replace(/^\.+/,'').slice(0,150) || 'original';
export const phoneZipBudget = 128 * 1024 * 1024;
export async function sourceOriginal(client,type,row,signal) {
  if (type==='driver') return fetchRecordOriginal(client,row,signal);
  if (type==='cost') return loadOriginal(client,{...row,storage_backend:'database'},'rr_lease_wallet_download_chunk');
  return loadOriginal(client,row);
}

export function planQuarterParts(records,sources,budget=phoneZipBudget) {
  const parts=[{number:1,bytes:0,files:[]}], separate=[], manifest=[];
  const groups=[['driver',records.filter(r=>r.file_name)],['freight',sources.documents],['cost',sources.proofs]];
  for (const [type,rows] of groups) {
    for (const row of [...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)))) {
      if (!Number.isSafeInteger(row.byte_size) || row.byte_size<1)
        throw new Error('An original is missing its saved length. Refresh before exporting.');
      const item={type,row,path:'originals/'+type+'/'+safeFile(row.id)+'/'+safeFile(row.file_name)};
      let part=parts[parts.length-1], location;
      if (row.byte_size>budget) {
        separate.push(item);
        location='individual';
      } else {
        if (part.bytes+row.byte_size>budget) {
          part={number:parts.length+1,bytes:0,files:[]};
          parts.push(part);
        }
        part.files.push(item);
        part.bytes+=row.byte_size;
        location=part.number;
      }
      manifest.push({source:type,id:row.id,path:item.path,part:location,sha256:row.sha256,
        byte_size:row.byte_size,load_id:row.load_id || '',revision:row.revision || ''});
    }
  }
  return {parts,separate,manifest};
}

function assertFreightMatches(activity,loads,legacy) {
  const confirmed=legacy.filter(r=>r.confirmed);
  const sum=values=>values.some(v=>v==null)?null:values.reduce((total,v)=>total+v,0);
  if (loads.length!==activity.canonical_load_count || confirmed.length!==activity.legacy_load_count ||
      legacy.length-confirmed.length!==activity.legacy_review_count ||
      sum([...loads,...confirmed].map(r=>r.gross_cents))!==activity.gross_cents ||
      sum([...loads.map(r=>r.operator_share_cents),...confirmed.map(r=>r.gross_cents)])!==activity.operator_share_cents)
    throw new Error('The quarter changed while preparing the export. Refresh and retry.');
}

export async function buildQuarterArchive({client,operatorId,start,owner,activity,records,sources,partNumber=1,
  budget=phoneZipBudget,signal,onProgress=()=>{}}) {
  const {loads,legacy,costs,statements,documents,proofs}=sources;
  assertFreightMatches(activity,loads,legacy);
  if (activity.posted_cost_row_count != null && (costs.length!==activity.posted_cost_row_count ||
      costs.reduce((total,row)=>total+row.amount_cents,0)!==activity.posted_cost_row_amount_cents))
    throw new Error('The quarter changed while preparing the export. Refresh and retry.');
  const {parts,separate,manifest}=planQuarterParts(records,sources,budget);
  const part=parts[partNumber-1];
  if (!part) throw new Error('Choose an available ZIP part.');
  const hasParts=parts.length>1 || separate.length>0;
  const archive=new ChunkedZip(), missing=[];
  for (let index=0;index<part.files.length;index++) {
    signal?.throwIfAborted();
    const {type,row,path}=part.files[index];
    onProgress('Verifying file '+(index+1)+' of '+part.files.length+(hasParts?' in part '+partNumber:''));
    const original=await sourceOriginal(client,type,row,signal);
    archive.add(path,original,await inspectBlob(original,{signal}));
  }
  const freightEvidence=new Set(documents.map(d=>d.load_id+'|'+d.kind));
  const costEvidence=new Set(proofs.map(p=>p.id));
  for (const l of loads) {
    for (const kind of ['ratecon','pod']) {
      if (!freightEvidence.has(l.id+'|'+kind)) missing.push({source:'load',id:l.id,missing:kind});
    }
  }
  for (const c of costs) {
    if (!costEvidence.has(c.wallet_document_id)) missing.push({source:'cost',id:c.id,missing:'linked original'});
  }
  for (const r of records) if (!r.file_name) missing.push({source:'driver',id:r.id,missing:'attached original'});
  for (const r of legacy) missing.push({source:'historical index',id:r.legacy_key,missing:'historical originals outside this export'});
  const summary = summarizeDriverRecords(records,start);
  // Across refreshes only matching export identifiers belong to the same data snapshot.
  const snapshot = await sha256(new TextEncoder().encode(JSON.stringify([operatorId,start,activity,records,loads,legacy,costs,statements,manifest])));
  const partName = 'RoadReady-' + safeFile(operatorId) + '-' + quarterTitle(start).replace(' ','-') +
    (hasParts ? '-'+snapshot.slice(0,12)+'-part-'+partNumber+'-of-'+parts.length : '') + '.zip';
  const notes = [
    quarterTitle(start) + ' • ' + (owner ? 'Carrier' : 'Leased operator') + ' • USD; financial CSV values in cents.',
    'Quarter by Chicago calendar. Income uses actual delivery dates; costs use purchase dates for carriers and statement week start for leased operators (including drafts).',
    'Driver-entered expenses are separate from posted costs; reconcile overlap before using them for taxes.',
    'Jurisdiction miles and gallons come from dated driver entries. Missing readings are blank; hours in an ELD file do not establish state miles.',
    'Export ID '+snapshot+'. ZIP part '+partNumber+' of '+parts.length+'. Each part has the full ledger and originals-manifest.csv. Collect every numbered part and any originals marked individual. Each original is included once.',
    'The archive includes saved records, recorded originals available to this account, and a missing-evidence list. Historical index entries do not contain original attachments.',
    'Filing proof is a saved copy of a previously filed return. Exporting prepares workpapers; it does not file a return or attest compliance.',
  ];
  const text = (path,value) => archive.text(path,value,{signal});
  await text('README.txt',notes.join('\r\n'));
  await text('summary.json',JSON.stringify({operator_id:operatorId,start,end_exclusive:shiftQuarter(start,1),activity,historical_review_pending:activity.legacy_review_count>0,logbook_copy_coverage:coverageDays(records,start),filed_copies:filingCoverage(records,start),export_id:snapshot,zip_part:partNumber,zip_parts:parts.length,original_count:manifest.length,originals_in_this_part:part.files.length,individual_originals:separate.length,missing_evidence_count:missing.length},null,2));
  await text('loads.csv',csv(['id','load_number','broker_name','actual_delivery_date','gross_cents','operator_share_cents','carrier_share_cents'],loads));
  await text('historical-load-index.csv',csv(['legacy_key','load_number','broker_name','delivery_date','gross_cents','confirmed','conflicting'],legacy));
  await text('posted-costs.csv',csv(['id','purchased_on','settlement_id','kind','paid_by','description','amount_cents','settlement_effect_cents','evidence_reference','wallet_document_id'],costs));
  await text('statement-weeks.csv',csv(['id','week_start','status'],statements));
  await text('driver-records.csv',csv(recordFields.split(',').filter(k=>k!=='operator_id'),records));
  await text('jurisdiction-totals.csv',csv(['unit','jurisdiction','miles','taxable_miles','missing_taxable_miles','tax_paid_power_gallons','other_or_unverified_gallons'],summary.ifta));
  const fuelRows=summary.ifta.flatMap(g=>Object.entries(g.fuel_by_type).map(([classification,gallons])=>({unit:g.unit,jurisdiction:g.jurisdiction,classification,gallons})));
  await text('fuel-by-type.csv',csv(['unit','jurisdiction','classification','gallons'],fuelRows));
  await text('driver-costs-by-category.csv',csv(['category','amount_cents'],summary.spending.map(([category,amount_cents])=>({category,amount_cents}))));
  await text('archive-parts.csv',csv(['part','original_count','original_bytes'],parts.map(p=>({part:p.number,original_count:p.files.length,original_bytes:p.bytes}))));
  await text('originals-manifest.csv',csv(['source','id','load_id','revision','part','path','byte_size','sha256'],manifest));
  await text('missing-evidence.csv',csv(['source','id','missing'],missing));
  signal?.throwIfAborted();
  return archive.file(partName);
}
