// A reviewed exception names the exact original, contract pages and proof pages.
// It is displayed as accepted photo evidence, never as a receiver signature.
export function acceptedPhotoProof(folder,kind){
 const proof=folder.source?.acceptedEvidenceV1?.[kind];
 if(!proof||proof.kind!=='photos'||proof.reviewed!==true||!/^([a-f0-9]{64})$/.test(proof.sha256||''))return null;
 const valid=pages=>Array.isArray(pages)&&pages.length>0&&pages.every(p=>Number.isInteger(p)&&p>0);
 if(!valid(proof.contractPages)||!valid(proof.evidencePages))return null;
 const docs=folder.documents.filter(d=>d.sha256===proof.sha256);
 if(!docs.length)return null;
 return {doc:docs[0],pages:proof.evidencePages,label:kind==='bol'?'Pickup proof (photos)':'Delivery proof (photos)',detail:'Broker accepts photos · original Ratecon retained'};
}
