// Read-only reconciliation of copies of the same original, before load/week grouping.
// A filename or BOL number alone never establishes source identity.
const text=value=>String(value??'').trim();
const list=value=>Array.isArray(value)?value:[];
const upper=value=>text(value).toUpperCase();
const load=doc=>upper(doc.load_no||doc.loadNo||doc.canonicalLoadNo||doc.extracted?.canonicalLoadNo||doc.extracted?.loadNo);
const kind=doc=>text(doc.document_type||doc.type||doc.extracted?.type).toLowerCase();
const review=doc=>doc.extracted?.evidenceFactsV1;
const owner=doc=>text(doc.owner_user_id||doc.user_id||doc.ownerId);
const hashes=doc=>[...new Set([doc.sha256,doc.content_hash,doc.contentHash,doc.metadata?.sha256].map(v=>text(v).toLowerCase()).filter(Boolean))];
const hash=doc=>{const values=hashes(doc);return values.length===1&&/^[a-f0-9]{64}$/.test(values[0])?values[0]:'';};
const tokens=doc=>[
  ['client',doc.client_document_id||doc.clientDocumentId],
  ['local',doc.local_id||doc.localDocumentId||doc.id],
  ['server',doc.server_document_id||doc.serverDocumentId]
].filter(([,value])=>text(value)).map(([name,value])=>name+':'+text(value));
const sameIdentity=(a,b)=>tokens(a).some(token=>tokens(b).includes(token));
const time=value=>typeof value==='number'?value:Date.parse(value)||0;
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const signature=doc=>stable({kind:kind(doc),fields:review(doc)?.fields,components:review(doc)?.components||[]});
export const sourceCopyIdentity=doc=>text(doc.sourceCopyReviewV110419?.clientDocumentId||doc.sourceCopyReviewV110419?.localDocumentId||doc.client_document_id||doc.clientDocumentId||doc.local_id||doc.localDocumentId||doc.id);
export const sourceConflictIdentity=doc=>doc.sourceCopyConflictV110419?text(doc.local_id||doc.localDocumentId||doc.id)+'|'+signature(doc):'';
export function confirmedSource(doc,resolve=upper){
  const r=review(doc),h=hash(doc),target=resolve(r?.fields?.loadNo);
  return !!(h&&r?.version===1&&['driver_review','source_recovery'].includes(r.source)&&time(r.reviewedAt)&&r.sourceSha256===h&&target&&resolve(load(doc))===target&&!list(r.components).some(c=>c.fields?.loadNo&&resolve(c.fields.loadNo)!==target));
}
function compatible(a,b){
  if(owner(a)&&owner(b)&&owner(a)!==owner(b))return false;
  const aHashes=hashes(a),bHash=hash(b);
  if(aHashes.some(h=>h!==bHash))return false;
  return sameIdentity(a,b)||!!(hash(a)&&hash(a)===bHash&&owner(a)===owner(b));
}
function laterAssignment(doc,at){
  return list(doc.auditTrail).some(item=>time(item.at)>at&&/assign|organiz|evidence_review|document_update/i.test(text(item.action)));
}
export function projectReviewedCopies(documents=[],resolve=upper){
  const originals=list(documents).filter(Boolean).map(doc=>{
    if(!doc.sourceCopyConflictV110419)return doc;
    const clean={...doc};delete clean.sourceCopyConflictV110419;return clean;
  }),index=new Map(),hashGroups=new Map(),conflicts=new Set();
  for(const doc of originals){
    if(!confirmedSource(doc,resolve)||doc.sourceCopyReviewV110419)continue;
    const group=owner(doc)+'|'+hash(doc);
    if(!hashGroups.has(group))hashGroups.set(group,[]);hashGroups.get(group).push(doc);
    for(const key of [...tokens(doc),...(hash(doc)?['hash:'+hash(doc)]:[])]){
      if(!index.has(key))index.set(key,[]);index.get(key).push(doc);
    }
  }
  for(const group of hashGroups.values()){
    const current=group.filter(doc=>!group.some(other=>sameIdentity(doc,other)&&time(review(other).reviewedAt)>time(review(doc).reviewedAt)));
    if(new Set(current.map(signature)).size>1)for(const doc of current)conflicts.add(doc);
  }
  return originals.map(doc=>{
    if(conflicts.has(doc))return {...doc,sourceCopyConflictV110419:true};
    // Keep explicit reorganizations and contradictory/replaced originals visible.
    if(doc.repairOverlayApplied||doc.sourceCopyReviewV110419)return doc;
    const candidates=[...new Set([...tokens(doc),...(hash(doc)?['hash:'+hash(doc)]:[])].flatMap(key=>index.get(key)||[]))].filter(other=>other!==doc&&compatible(doc,other));
    if(!candidates.length)return doc;
    const own=review(doc),ownTime=time(own?.reviewedAt);
    if(own){
      if(!confirmedSource(doc,resolve))return doc;
      // Only a newer review of the same saved identity can supersede a review.
      candidates.splice(0,candidates.length,...candidates.filter(other=>sameIdentity(doc,other)&&time(review(other).reviewedAt)>ownTime));
      if(!candidates.length)return doc;
    }
    const byIdentity=new Map();
    for(const candidate of candidates){
      const key=text(candidate.client_document_id||candidate.clientDocumentId)||tokens(candidate).join('|');
      const previous=byIdentity.get(key),at=time(review(candidate).reviewedAt);
      if(!previous||at>time(review(previous).reviewedAt))byIdentity.set(key,candidate);
      else if(at===time(review(previous).reviewedAt)&&signature(previous)!==signature(candidate))return doc;
    }
    const choices=[...byIdentity.values()];
    if(new Set(choices.map(owner).filter(Boolean)).size>1)return doc;
    if(new Set(choices.map(signature)).size!==1)return doc;
    const authority=choices.sort((a,b)=>time(review(b).reviewedAt)-time(review(a).reviewedAt))[0];
    const r=review(authority),target=resolve(r.fields.loadNo);
    if(laterAssignment(doc,time(r.reviewedAt)))return doc;
    if(!sameIdentity(doc,authority)&&(kind(doc)!==kind(authority)||Number(doc.stopSequence||doc.extracted?.stopSequence||0)!==Number(authority.stopSequence||authority.extracted?.stopSequence||0)))return doc;
    const fields={...r.fields,loadNo:target};
    return {...doc,load_no:target,loadNo:target,canonicalLoadNo:target,
      type:kind(authority),document_type:kind(authority),document_date:fields.date||'',documentDate:fields.date||'',date:fields.date||'',
      sha256:hash(authority),reviewStatus:'verified',
      extracted:{...doc.extracted,...fields,type:kind(authority),canonicalLoadNo:target,evidenceFactsV1:r},
      sourceCopyReviewV110419:{previousLoadNo:load(doc),clientDocumentId:text(authority.client_document_id||authority.clientDocumentId),localDocumentId:text(authority.local_id||authority.localDocumentId||authority.id),reviewedAt:r.reviewedAt}};
  });
}
export function preferredSourceCopy(a,b){
  if(!review(a)&&!review(b)){
    const newest=time(a.updated_at||a.updatedAt||a.created_at||a.createdAt)>time(b.updated_at||b.updatedAt||b.created_at||b.createdAt)?a:b;
    const older=newest===a?b:a;
    return {...older,...newest,extracted:{...older.extracted,...newest.extracted}};
  }
  const score=doc=>[Number(confirmedSource(doc)),Number(!doc.sourceCopyReviewV110419),time(review(doc)?.reviewedAt),time(doc.updated_at||doc.updatedAt||doc.created_at||doc.createdAt)];
  const left=score(a),right=score(b);
  for(let i=0;i<left.length;i++)if(left[i]!==right[i])return left[i]>right[i]?a:b;
  return a;
}
export function selectReviewRecord(matches,shown,sourceHash){
  const fail=()=>{throw new Error('These source copies disagree. Reopen the document before saving.');};
  if(!matches.length)fail();
  if(new Set(matches.map(owner).filter(Boolean)).size>1)fail();
  for(const record of matches){
    if(hashes(record).some(value=>value!==sourceHash))fail();
    if(owner(record)&&owner(shown)&&owner(record)!==owner(shown))fail();
  }
  const exact=matches.filter(record=>text(record.local_id)===text(shown.local_id));
  const current=matches.length===1?matches[0]:exact.length===1?exact[0]:null;
  if(!current)fail();
  const at=time(review(current)?.reviewedAt);
  for(const record of matches){
    if(record===current||!review(record))continue;
    const otherTime=time(review(record).reviewedAt);
    if(otherTime>at||otherTime===at&&signature(record)!==signature(current))fail();
    if(!confirmedSource(record))fail();
  }
  return current;
}
