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
const portable=decoratePortableArchiveV110429(archive);
assert.equal(portable.portableFormat,'road_ready_everything_v1');
assert.equal(portable.portableReview.documents[0].originalFileName,'pod.pdf');
assert.equal('base64' in portable.portableReview,false);
console.log('PASS — portable everything backup adds a readable ChatGPT review index without duplicating binary originals');
