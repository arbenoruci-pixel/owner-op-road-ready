import {PROFILES,normalizeValue} from '../../packages/smart-reader-core/src/profiles.js';
import {fieldsForProfile} from '../../packages/smart-reader-core/src/engine.js';
import {SMART_READING_VERSION,SMART_FIELDS} from './smartReading.js';

export const AUTOMATIC_REQUIRED={bol:['bolNumber','shipper','consignee','documentDate'],pod:['bolNumber','shipper','consignee','deliveryDate'],
  rate_confirmation:['loadNumber','totalRate','pickupDate','shipper','consignee'],delivery_order:['loadNumber','shipper','consignee'],
  delivery_receipt:['bolNumber'],fuel_receipt:['merchant','total','gallons'],unloading_receipt:['receiptNumber','amount','total'],receipt:['merchant','total'],invoice:['invoiceNumber','vendor','total'],packing_list:['poNumber','shipper','consignee']};
const dateKeys=['deliveryDate','documentDate','date','receiptDate','invoiceDate','pickupDate'];
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function normalizeAutomaticValue(kind,raw,{year=new Date().getFullYear()}={}){
  if(typeof raw!=='string'||!raw.trim())return {value:null};
  if(['date','ship_date'].includes(kind)){
    const match=/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(raw.trim());
    // Road Ready's US trucking documents use month/day/year. Keep this
    // explicit convention in provenance; never resolve a missing date.
    if(match){const y=match[3].length===2?2000+Number(match[3]):Number(match[3]),m=Number(match[1]),d=Number(match[2]);
      const value=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if(Math.abs(y-year)>2)return {value:null};
      const parsed=new Date(value+'T00:00:00Z');
      return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?{value,convention:'US month/day/year'}:{value:null};
    }
  }
  const value=normalizeValue(kind,raw);
  if(['date','ship_date'].includes(kind)&&value.value&&Math.abs(Number(value.value.slice(0,4))-year)>2)return {value:null};
  return value.issue?{value:null}:value;
}
export function applyAutomaticReading(result,reading,{groupId,pageId,sourceImageId,imageHash,originalHash,expectedRevision,year}={}){
  const group=result?.documents?.find(g=>g.id===groupId),page=result?.pages?.find(p=>p.id===pageId);
  if(!group||result.reviewRevision!==expectedRevision||!group.pageIds.includes(pageId)||sourceImageId!==`${result.documentId}:${pageId}:original`
    ||!page?.observations.some(o=>o.sourceImageId===sourceImageId)||reading?.version!==SMART_READING_VERSION||reading.imageHash!==imageHash
    ||!(/^[a-f0-9]{64}$/.test(imageHash||'')&&/^[a-f0-9]{64}$/.test(originalHash||''))||reading.origin!=='machine'||reading.passes!==2)throw new Error('The page changed. Read the current original again.');
  const next=structuredClone(result),target=next.documents.find(g=>g.id===groupId);
  const reason=reading.verified!==true?'Reading needs attention':result.documents.length!==1||result.pages.length!==1||result.pageCount!==1||group.pageIds.length!==1||group.boundaryReview?'Check the document pages together':
    group.typeCorrection?.origin==='human'||Object.values(group.fields).some(f=>f.correction?.origin==='human')?'Your checked details are kept':null;
  const proof={version:1,documentId:result.documentId,groupId,pageId,sourceImageId,imageHash,originalHash,origin:'machine',method:reading.method,model:reading.model,checkedAt:reading.checkedAt,passes:2,ready:false,issues:[...(reading.issues||[])],unresolved:[...(reading.unresolved||[])]};
  next.automaticReading=proof;
  if(reason){proof.message=reason;return next;}
  const profile=PROFILES.find(p=>p.id===reading.kind);
  if(!profile||!SMART_FIELDS[reading.kind])return next;
  if(target.kind!==reading.kind)Object.assign(target,{kind:profile.id,label:profile.label,role:profile.role||'primary',fields:fieldsForProfile(next.pages.filter(p=>target.pageIds.includes(p.id)),profile.id)});
  const sourcePage={pageId,pageNumber:page.number,sourceImageId,boxScope:'page',imageHash,originalHash};
  target.identityStatus='confirmed';
  target.typeCorrection={kind:reading.kind,sourcePage,origin:'machine',confirmed:true,method:reading.method,delivery:reading.delivery,trainingEligible:false};
  // Retain OCR candidates for inspection, while only agreed image values
  // can enter the automatic filing payload.
  for(const key of SMART_FIELDS[reading.kind]){
    const field=target.fields[key];
    if(field)target.fields[key]={...field,value:null,status:field.candidates?.length?'needs_review':'missing',correction:null};
  }
  for(const row of reading.fields||[]){
    if(!SMART_FIELDS[reading.kind].includes(row.field)||!target.fields[row.field]||!Array.isArray(row.quotes)||row.quotes.length!==2||row.quotes.some(q=>typeof q!=='string'||!q.replace(/\s+/g,' ').toUpperCase().includes(row.rawValue.toUpperCase())))continue;
    const field=target.fields[row.field],normalized=normalizeAutomaticValue(field.kind,row.rawValue,{year});
    if(!normalized.value){proof.unresolved.push(row.field);continue;}
    const correction={documentId:result.documentId,groupId,field:row.field,sourcePage,rawValue:row.rawValue,value:normalized.value,
      sourceQuote:null,visualQuotes:row.quotes,origin:'machine',confirmed:true,method:reading.method,model:reading.model,
      checkedAt:reading.checkedAt,...(normalized.convention?{dateConvention:normalized.convention}:{}),trainingEligible:false};
    target.fields[row.field]={...field,value:normalized.value,status:'confirmed',issues:[],correction};
  }
  next.reviewRevision++;
  proof.revision=next.reviewRevision;proof.kind=reading.kind;proof.filingType=profile.filingType||profile.id;
  const filingDates=reading.kind==='pod'?dateKeys:reading.kind==='rate_confirmation'?['pickupDate','documentDate','deliveryDate']:['documentDate','date','receiptDate','invoiceDate','pickupDate','deliveryDate'];
  proof.date=filingDates.map(k=>target.fields[k]).find(f=>f?.correction?.origin==='machine'&&/^\d{4}-\d{2}-\d{2}$/.test(f.value))?.value||'';
  const missing=(AUTOMATIC_REQUIRED[reading.kind]||[]).filter(k=>target.fields[k]?.correction?.origin!=='machine');
  proof.ready=!missing.length&&Boolean(proof.date);
  proof.missing=[...missing,...(!proof.date?['documentDate']:[])];
  proof.message=proof.ready?'Read and checked automatically':`Check ${[...new Set(proof.missing)].map(k=>target.fields[k]?.label||'document date').join(', ')}`;
  target.requiresReview=!proof.ready;target.canAutoFile=false;
  return next;
}

// Exact, typed identifiers must name one folder. An active load, a similar
// route, or a high score alone never establishes automatic filing identity.
export function automaticFolder(result,candidates=[]){
  const proof=result?.automaticReading,group=result?.documents?.find(g=>g.id===proof?.groupId);
  if(!proof?.ready||proof.revision!==result.reviewRevision||!group)return null;
  const refs=['bolNumber','loadNumber','poNumber'].map(k=>({key:k,value:norm(group.fields[k]?.correction?.origin==='machine'?group.fields[k].value:'')})).filter(r=>r.value.length>=4&&/\d/.test(r.value));
  const matching=new Map();
  for(const ref of refs){
    const kinds=ref.key==='bolNumber'?['bol_number','bol']:ref.key==='poNumber'?['po_number','pickup_number','sales_order']:['load_number','order_number','leg_number'];
    for(const c of candidates){
      const values=[...(ref.key==='loadNumber'?[c.loadNo]:[]),...(c.aliases||[]).filter(a=>kinds.includes(a.kind)).map(a=>a.value),
        ...(c.stops||[]).flatMap(s=>ref.key==='bolNumber'?[s.bolNumber,s.bolNo]:ref.key==='poNumber'?[s.poNumber,s.pickupNumber,s.deliveryNumber]:[]),
        ...(ref.key==='bolNumber'&&c.shipmentFiling?[c.shipmentReference]:[])];
      if(values.some(v=>norm(v)===ref.value)){
        if(c.shipmentAmbiguous||c.brokerIdentityConflict)return null;
        const knownDate=c.pickupDate||c.documentDate||c.deliveryDate;
        if(/^\d{4}-\d{2}-\d{2}$/.test(knownDate||'')&&Math.abs(Date.parse(knownDate)-Date.parse(proof.date))>30*86400000)return null;
        matching.set(c.id||c.loadNo,c);
      }
    }
  }
  if(matching.size!==1)return null;
  const candidate=[...matching.values()][0];
  return {matched:true,automatic:true,requiresConfirmation:false,loadNo:candidate.loadNo,canonicalLoadId:candidate.id,
    broker:candidate.broker||'',source:'machine_verified_reference',candidates:[candidate],stopSequence:0,
    reason:'Verified document reference matches this folder.'};
}

// Confirm the current source projection actually contains the accepted values
// before any save or business-record writer consumes it.
export function automaticPayloadMatches(result,analysis,selectedType){
  const proof=result?.automaticReading,group=result?.documents?.find(g=>g.id===proof?.groupId),source=analysis?.fields?.readerSourceFieldsV110393;
  if(!proof?.ready||proof.revision!==result.reviewRevision||proof.filingType!==selectedType||!group
    ||source?.documentId!==result.documentId||source.reviewRevision!==proof.revision)return false;
  const keys={bolNumber:'bolNo',loadNumber:'loadNo',totalRate:'gross',invoiceNumber:'invoiceNo',receiptNumber:'receiptNo',invoiceDate:'documentDate',receiptDate:'documentDate',date:'documentDate'};
  return (AUTOMATIC_REQUIRED[proof.kind]||[]).every(key=>{
    const field=group.fields[key],stored=source.fields[keys[key]||key];
    return field?.correction?.origin==='machine'&&stored?.status==='confirmed'&&stored.value===field.value
      &&stored.sourcePage?.originalHash===proof.originalHash&&analysis.fields[keys[key]||key]===field.value;
  });
}
