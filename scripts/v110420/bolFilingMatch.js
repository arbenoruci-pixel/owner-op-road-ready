// A re-scan has different bytes. A reviewed reference can suggest filing, but
// it never merges originals, changes a load or marks the re-scan as reviewed.
export function reviewedBolFilingMatch(doc,documents,resolve=value=>text(value).toUpperCase()) {
  if(kindOf(doc)!=='bol'||doc.extracted?.evidenceFactsV1||doc.sourceCopyConflictV110419)return null;
  const hashes=sourceHashes(doc),fields=documentFacts(doc),ref=text(fields.reference).toUpperCase(),date=day(fields.date);
  if(hashes.length!==1||!/^[a-f0-9]{64}$/.test(hashes[0])||!date||!/[A-Z0-9]/.test(ref)||ref.length<3||!usable(ref,'reference'))return null;
  const owner=d=>text(d.owner_user_id||d.user_id||d.ownerId);
  const matches=documents.filter(other=>other!==doc&&idOf(other)!==idOf(doc)&&owner(other)===owner(doc)
    &&kindOf(other)==='bol'&&confirmedSource(other,resolve)&&!other.sourceCopyConflictV110419
    &&sourceHashes(other).length===1&&sourceHashes(other)[0]!==hashes[0]
    &&!list(other.extracted?.evidenceFactsV1?.components).length
    &&text(documentFacts(other).reference).toUpperCase()===ref&&day(documentFacts(other).date)===date);
  if(!matches.length)return null;
  const proposals=matches.map(other=>{const f=documentFacts(other);return {loadNo:resolve(f.loadNo),reference:ref,date,origin:text(f.origin),destination:text(f.destination)};});
  if(new Set(proposals.map(f=>JSON.stringify(f))).size!==1)return null;
  const proposed=proposals[0];
  if(!proposed.loadNo||proposed.loadNo===resolve(loadOf(doc))||!usable(proposed.origin,'origin')||!usable(proposed.destination,'destination'))return null;
  return {fields:proposed,sourceDocumentId:idOf(matches[0]),sourceSha256:sourceHashes(matches[0])[0],previousLoadNo:resolve(loadOf(doc))};
}
