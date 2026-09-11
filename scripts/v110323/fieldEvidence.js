const shipping=new Set(['bol','pod','delivery_receipt']);
const compact=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const labelNames={bolNo:'BOL number',documentDate:'Document date',carrierName:'Carrier',origin:'Ship from',destination:'Ship to'};
const states=new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR VI'.split(' '));
const boundary=/^(?:BILL OF|BOL\b|SHIP FROM|SHIP TO|SHIPPER|CONSIGNEE|CARRIER\b|CUSTOMER ORDER|SPECIAL INSTRUCTIONS|FREIGHT|HANDLING|TOTAL|THIRD PARTY|REMIT|COD\b|SIGNATURE|DATE\b)/i;
function normalizeLabels(text){
  return String(text||'').replace(/\r/g,'')
    .replace(/\b((?:BILL[ \t]+OF[ \t]+LADING|BOL|LOAD|SHIPMENT|ORDER|PO|PICKUP)\s*(?:NUMBER|NO\.?|#)\s*[:#-]?\s*)(\d{3,}(?:[ \t]+\d{2,})+)(?=$|[ \t]*\n)/gim,(_,label,value)=>label+value.replace(/[ \t]/g,''));
}
function spatialText(pass){
  const words=(pass.words||[]).filter(w=>w.text&&Number.isFinite(w.left)&&Number.isFinite(w.top)).sort((a,b)=>a.top-b.top||a.left-b.left);
  const rows=[];
  for(const word of words){const cy=word.top+word.height/2;let row=rows.find(r=>Math.abs(r.cy-cy)<Math.max(3,Math.min(r.height,word.height)*.5));if(!row){row={cy,height:word.height,words:[]};rows.push(row);}row.words.push(word);}
  return rows.sort((a,b)=>a.cy-b.cy).map(row=>row.words.sort((a,b)=>a.left-b.left).map((word,i,all)=>(i&&word.left-(all[i-1].left+all[i-1].width)>Math.max(12,word.height*1.5)?'   ':' ')+word.text).join('').trim()).join('\n');
}
function addresses(text){
  const lines=String(text).split('\n').map(l=>l.trim()).filter(Boolean),out={};
  for(let i=0;i<lines.length;i++){
    const head=lines[i].match(/^(SHIP\s*FROM|SHIPPER|SHIP\s*TO|CONSIGNEE)(?:\s*(?:NAME|ADDRESS))?\s*[:#-]?\s*(.*)$/i);if(!head)continue;
    const key=/FROM|SHIPPER/i.test(head[1])?'origin':'destination',block=[head[2]];
    for(let j=i+1;j<Math.min(lines.length,i+7);j++){if(boundary.test(lines[j]))break;block.push(lines[j]);}
    const place=block.join('\n').match(/(?:^|\n)([A-Z][A-Z .'-]{1,38}?),?\s+([A-Z]{2})\s*(?:\d{5}(?:-\d{4})?)?(?=$|\s|\n)/i);
    if(place&&states.has(place[2].toUpperCase())){const value=place[1].trim()+', '+place[2].toUpperCase();(out[key]||=[]).push({value,label:key==='origin'?'Ship from':'Ship to',excerpt:lines[i]+'\n'+block.join('\n'),source:'document_text',status:'read'});}
  }
  return out;
}
function sameValue(key,value){return /Date$/.test(key)||key==='date'?String(value):compact(value);}
export function qualifyFieldEvidenceV110323(result,baseline){
  if(!shipping.has(result.type?.id))return result;
  const originals=(result.ocrEvidenceV110323||[]).filter(p=>p.text);
  const inputs=originals.length?originals:[{id:'source-text',page:1,text:result.text||result.rawText||'',confidence:.85}];
  const candidates=new Map(),readings=[];
  function offer(key,e,pass){
    if(e?.value==null)return;
    const list=candidates.get(key)||[],token=sameValue(key,e.value),existing=list.find(item=>item.token===token);
    if(existing){existing.passIds.add(pass.id);existing.score=Math.max(existing.score,Number(pass.confidence||0));}
    else list.push({token,value:e.value,evidence:e,passIds:new Set([pass.id]),score:Number(pass.confidence||0)});
    candidates.set(key,list);
  }
  for(const pass of inputs){
    const plain=normalizeLabels(pass.text),spatial=normalizeLabels(spatialText(pass));
    const versions=[plain,...(spatial&&spatial!==plain?[spatial]:[])];
    const perPass=new Map();
    for(const text of versions){
      const reading=baseline({...result,text,rawText:text,fields:{},evidenceReviewV11036:{issues:[]}});readings.push(reading);
      // Spatial rows replace reading-order guesses within one OCR pass.
      for(const [key,e]of Object.entries(reading.fieldEvidence||{})){
        const value=reading.fields[key]??e.value;
        if(/^(?:SEC(?:TION)?|PAGE|CLASS)\d+$/i.test(String(value)))continue;
        if(['shipper','consignee','carrierName'].includes(key)&&/^(?:to be|hereby|signature|certif|subject to)/i.test(String(value)))continue;
        perPass.set(key,{...e,value});
      }
      const places=addresses(text);for(const [key,values]of Object.entries(places)){
        if(values.length===1)perPass.set(key,values[0]);
      }
    }
    for(const [key,e]of perPass)offer(key,e,pass);
  }
  const original=baseline({...result,text:normalizeLabels(result.text||result.rawText||'')});
  const fields={...original.fields},evidence={...original.fieldEvidence},resolved=[];
  for(const key of ['origin','destination']){delete fields[key];delete evidence[key];}
  for(const key of ['shipper','consignee','carrierName','sealNo','trailerNo'])if(fields[key]&&(/^(?:SEC(?:TION)?|PAGE|CLASS)\d+$/i.test(String(fields[key]))||/^(?:to be|hereby|signature|certif|subject to)/i.test(String(fields[key])))){delete fields[key];delete evidence[key];}
  for(const [key,list]of candidates){
    list.sort((a,b)=>b.passIds.size-a.passIds.size||b.score-a.score);
    // Repeated independent reads can resolve one damaged pass; ties stay for review.
    const winner=list[0],runner=list[1];
    if(runner&&!(winner.passIds.size>=2&&winner.passIds.size>runner.passIds.size)){
      if(['bolNo','documentDate','pickupDate','deliveryDate','loadNo','orderNo','origin','destination','sealNo','trailerNo','poNumber'].includes(key)){delete fields[key];delete evidence[key];}
      continue;
    }
    fields[key]=winner.value;evidence[key]={...winner.evidence,value:winner.value,fieldLabel:labelNames[key]||winner.evidence.fieldLabel||key,readCount:winner.passIds.size};resolved.push(key);
  }
  if(fields.documentDate)fields.date=fields.documentDate;else delete fields.date;
  // Normalize repeated company text (case/punctuation), while preserving actual conflicts.
  const issues=(original.evidenceReviewV11036?.issues||[]).filter(issue=>!resolved.some(key=>{
    const label=labelNames[key]||evidence[key]?.fieldLabel||key;
    return issue.startsWith('More than one '+label+' ')||key==='bolNo'&&issue.startsWith('BOL number was not verified')||key==='documentDate'&&issue.startsWith('Document date was not read');
  }));
  for(const key of ['bolNo','documentDate'])if(!fields[key]&&candidates.get(key)?.length>1&&!issues.some(s=>s.includes('More than one '+labelNames[key])))issues.push('More than one '+labelNames[key]+' was read. Check the original.');
  fields.references=[];
  for(const [key,kind]of Object.entries({bolNo:'bol_number',loadNo:'load_number',orderNo:'order_number',pickupNumber:'pickup_number',poNumber:'po_number',proNumber:'pro_number',trailerNo:'trailerNo',sealNo:'sealNo'}))if(fields[key])fields.references.push({kind,value:fields[key],source:'labeled_document_text'});
  for(const value of fields.poNumbers||[])fields.references.push({kind:'po_number',value,source:'labeled_document_text'});
  return {...original,fields,fieldEvidence:evidence,fieldReadingsV110323:inputs.map(p=>({id:p.id,page:p.page,confidence:p.confidence})),evidenceReviewV11036:{...original.evidenceReviewV11036,evidence,issues},semanticFieldsV11038:{...original.semanticFieldsV11038,version:'110.3.23'}};
}
