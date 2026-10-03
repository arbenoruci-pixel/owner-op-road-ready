import assert from 'node:assert/strict';
import {decoratePortableArchiveV110429,makePortableReviewV110429} from './portableBackup.js';

const archive={
 kind:'owner_op_road_ready_device_safety_archive',schemaVersion:1,appVersion:'110.4.29',createdAt:'2026-10-03T15:00:00Z',
 inventory:{logDays:1,events:2,businessLoads:1,documentBlobRows:1},
 payload:{
  state:{eventsByDay:{'2026-10-02':[{status:'D',startMin:60,endMin:120,city:'Chicago',state:'IL',loadNo:'A1'},{status:'ON',startMin:120,endMin:140,note:'Delivery',loadNo:'A1'}]},signatureByDay:{'2026-10-02':{signed:true}},inspectionByDay:{},routeLegsByDay:{},documentsByDay:{},fuelReceiptsByDay:{},certifyStatus:{'2026-10-02':'Certified'}},
  businessStore:{loads:[{loadNo:'A1',status:'delivered',gross:1800}]},
  dexie:{documents_local:[{type:'pod',load_no:'A1',original_file_name:'pod.pdf'}],document_blobs:[{local_blob_id:'b1',blob:{__roadReadyBinary:'Blob',base64:'AAAA'}}]},
  localStorage:[]
 }
};
const review=makePortableReviewV110429(archive);
assert.equal(review.logbook.length,1);
assert.equal(review.logbook[0].events.length,2);
assert.equal(review.logbook[0].signed,true);
assert.equal(review.loads[0].loadNo,'A1');
assert.equal(review.documents[0].type,'pod');
const portable=await decoratePortableArchiveV110429(archive);
assert.equal(portable.portableFormat,'road_ready_everything_v1');
assert.equal(portable.portableReview.documents[0].originalFileName,'pod.pdf');
assert.equal('base64' in portable.portableReview,false);
console.log('PASS — portable everything backup adds a readable ChatGPT review index without duplicating binary originals');

const privateArchive=structuredClone(archive);
privateArchive.payload.localStorage=[{key:'owner-op-prototype-auth-v1',value:'secret-access-refresh-tokens'},{key:'road-ready-session-cache',value:'secret-session'},{key:'owner-op-road-ready-prepared-device-safety-v110429',value:'foreign-receipt'},{key:'owner-op-road-ready-business-v1',value:'saved-records'}];
const sanitized=await decoratePortableArchiveV110429(privateArchive);
assert.equal(JSON.stringify(sanitized).includes('secret-'),false);
assert.equal(sanitized.payload.localStorage.length,1);
const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sanitized.payload)));
assert.equal(sanitized.payloadSha256,Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join(''));
const team=structuredClone(archive);team.payload.state.activeDriverId='alpha';team.payload.state.teamDrivers=[{id:'alpha',name:'Alpha'},{id:'beta',name:'Beta'}];team.payload.state.teamLogbooksByDriverId={alpha:structuredClone(team.payload.state),beta:{eventsByDay:{'2026-10-01':[{id:'b',status:'SB',startMin:0,endMin:1440}]},signatureByDay:{'2026-10-01':{signed:true}}}};
const teamReview=makePortableReviewV110429(team);
assert.equal(teamReview.logbook.length,2);assert.equal(teamReview.logbook[1].driverId,'beta');assert.equal(teamReview.logbook[1].driverName,'Beta');assert.equal(teamReview.logbook[1].signed,true);assert.equal(teamReview.logbook[1].events[0].status,'SB');
console.log('PASS — portable exports remove sessions and local safety receipts, recompute checksum, and include inactive drivers without duplicating the active logbook');
