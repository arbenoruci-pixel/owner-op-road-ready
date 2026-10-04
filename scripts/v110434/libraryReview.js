// Importing another copy must not erase a source-bound review of the same filing.
export function retainedLibraryReview(old,incoming){
 const facts=old?.extracted?.evidenceFactsV1;
 const hashes=[old?.sha256,old?.content_hash,old?.contentHash].filter(Boolean);
 if(facts?.version!==1||!facts.reviewedAt||!hashes.length||hashes.some(h=>h!==incoming.sha256)||facts.sourceSha256!==incoming.sha256)return null;
 const oldLoad=old.load_no||old.loadNo||old.canonicalLoadNo||old.extracted?.loadNo||'';
 const oldKind=old.document_type||old.type||'';
 if(oldLoad!==incoming.loadNo||oldKind!==incoming.type||facts.fields?.loadNo!==incoming.loadNo)return null;
 if(incoming.date&&facts.fields?.date!==incoming.date)return null;
 return JSON.parse(JSON.stringify(facts));
}
