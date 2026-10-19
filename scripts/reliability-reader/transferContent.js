// Version 2 is used only when a portable load/week contains shared originals.
// Version 1 remains readable. Every filing keeps its independent record.
export function compactTransferOriginals(payload){
  const originals={},documents=[];let shared=false;
  for(const item of payload.documents||[]){
    const original=item.original,hash=original.sha256;
    if(originals[hash]){
      if(originals[hash].base64!==original.base64||originals[hash].size!==original.size)throw Error('Originals with the same checksum contain different bytes.');
      shared=true;
    }else originals[hash]=original;
    documents.push({...item,original:{ref:hash,sha256:hash,size:original.size,type:original.type}});
  }
  return shared?{...payload,version:2,originals,documents}:payload;
}
export function expandTransferOriginals(payload){
  if(payload?.version!==2)return payload;
  if(payload.format!=='road-ready-document-transfer'||!payload.originals||typeof payload.originals!=='object'||Array.isArray(payload.originals)||!Array.isArray(payload.documents))throw Error('Invalid shared-original transfer.');
  const documents=payload.documents.map(item=>{
    const ref=item?.original,hash=ref?.ref;
    if(!/^[a-f0-9]{64}$/.test(hash||'')||!Object.hasOwn(payload.originals,hash))throw Error('A shared original is missing or damaged.');
    const original=payload.originals[hash];
    if(original.sha256!==hash||ref.sha256!==hash||ref.size!==original.size||ref.type!==original.type)throw Error('A shared original reference is damaged.');
    return {...item,original};
  });
  return {...payload,version:1,documents};
}
