// Read-only folder identity. A similar route, BOL text or OCR guess is never a merge.
const list=value=>Array.isArray(value)?value:[];
const ref=value=>String(value??'').trim().toUpperCase();
const load=row=>ref(row?.load_no||row?.loadNo||row?.canonicalLoadNo);
const valid=value=>/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(value);

export function reviewedLoadAliases(store={},documents=[],overlay={}){
  const candidates=new Map();
  function add(from,to){
    from=ref(from);to=ref(to);
    if(!valid(from)||!valid(to)||from===to)return;
    if(!candidates.has(from))candidates.set(from,new Set());
    candidates.get(from).add(to);
  }
  // The current explicit mapping takes precedence over older recovery history.
  for(const a of list(store.evidenceAliases))add(a.from,a.to);
  for(const a of list(overlay.loadCorrections))add(a.aliasFrom,a.loadNo);
  const explicit=new Set(candidates.keys());
  for(const h of list(store.evidenceRecoveryHistory))for(const a of list(h.aliases))if(!explicit.has(ref(a.from)))add(a.from,a.to);
  for(const row of list(store.loads))for(const a of list(row.documentTransferAliases)){
    if(ref(a.to)===load(row)&&!explicit.has(ref(a.from)))add(a.from,a.to);
  }
  // Older week exports omitted the alias table. Recover only a reviewed rename
  // of an exported folder: its stable transfer ID AND a reviewed source-recovery
  // rename/reference must agree. A regular document reassignment is not a rename.
  const sources=[...list(documents),...list(store.documents)];
  for(const row of list(store.loads)){
    const from=ref(String(row.id||'').startsWith('transfer-load-')?row.id.slice('transfer-load-'.length):'');
    const to=load(row);
    if(!valid(from)||from===to||explicit.has(from))continue;
    const proof=sources.some(doc=>{
      const facts=doc.extracted?.evidenceFactsV1;
      const hash=ref(doc.sha256||doc.content_hash||doc.contentHash);
      const reviewedReference=['bol','pod'].includes(doc.document_type||doc.type)&&ref(facts?.fields?.reference)===from;
      const reviewedRename=list(doc.auditTrail).some(entry=>entry.action==='evidence_review'&&entry.source==='source_recovery'&&ref(entry.before?.loadNo)===from&&ref(entry.after?.loadNo)===to);
      return load(doc)===to&&ref(facts?.fields?.loadNo)===to&&facts?.source==='source_recovery'&&facts.reviewedAt&&
        /^[A-F0-9]{64}$/.test(hash)&&hash===ref(facts.sourceSha256)&&
        (reviewedRename||reviewedReference);
    });
    // A separately stored load or original under the old number needs review.
    if(proof&&!list(store.loads).some(other=>load(other)===from)&&!sources.some(doc=>load(doc)===from))add(from,to);
  }
  const resolved={};
  for(const from of candidates.keys()){
    let target=from;const seen=new Set();let safe=true;
    while(candidates.has(target)){
      const choices=candidates.get(target);
      if(seen.has(target)||choices.size!==1){safe=false;break;}
      seen.add(target);target=[...choices][0];
    }
    if(safe&&target!==from)resolved[from]=target;
  }
  return resolved;
}
