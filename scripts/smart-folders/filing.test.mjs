import test from 'node:test';
import assert from 'node:assert/strict';
import {collectShipmentScanCandidates,shipmentFilingFields} from '../../source/src/modules/scan/shipmentFiling.js';
import {loadPickerCandidates} from '../../source/src/modules/scan/loadPickerV110472.js';
import {operationalCandidateContext} from '../../source/src/modules/loads/currentLoadV110473.js';
import {reviewedFreightAliases} from '../../source/src/modules/owneros/loadAliasesV110416.js';
import {reconcileLoadFoldersV10974} from '../../source/src/modules/owneros/loadFolderReconciliationV10974.js';
import {buildSmartFolders,folderChecklist} from '../../source/src/modules/owneros/smartFolders.js';

test('final runtime keeps the reviewed BOL, Ratecon and save destination in one completed folder',()=>{
 const state={eventsByDay:{'2026-11-04':[{id:'pickup',status:'ON',startMin:600,note:'Pickup',shippingDocs:'SH045061',city:'Liverpool',state:'NY'}],'2026-11-06':[{id:'delivery',status:'ON',startMin:500,note:'Delivery',shippingDocs:'SH045061'}]},signatureByDay:{'2026-11-04':{data:'original-signature'}}};
 const businessStore={loads:[{id:'reviewed-load',loadNo:'31450-11788',canonicalLoadNo:'31450-11788',broker:'Vektor',status:'archived',operationalStatus:'closed',documentLibrarySource:'source_recovery',origin:'Liverpool, NY',destination:'Franklin, KY'}],evidenceAliases:[{from:'SH045061',to:'31450-11788'}],documents:[{id:'ratecon',type:'rate_confirmation',loadNo:'31450-11788',sha256:'a'.repeat(64)},{id:'bol',type:'bol',documentScope:'shipment',shipmentReference:'SH045061',sha256:'b'.repeat(64)},{id:'pod',type:'pod',documentScope:'shipment',shipmentReference:'SH045061',sha256:'c'.repeat(64)}]};
 const before=structuredClone({state,businessStore});
 const candidates=collectShipmentScanCandidates(state,businessStore);
 const choices=loadPickerCandidates(candidates,state,businessStore,operationalCandidateContext(state,businessStore,{day:'2026-11-08',minute:600}));
 const choice=choices.find(c=>c.loadNo==='31450-11788');
 assert.ok(choice);assert.equal(choices.some(c=>c.loadNo==='SH045061'),false);
 assert.deepEqual(shipmentFilingFields(choice),{},'scanner must retain canonical loadNo when saving');
 const model=reconcileLoadFoldersV10974({state,businessStore,loads:businessStore.loads,documents:businessStore.documents});
 const smart=buildSmartFolders({folders:model.folders,documents:model.allDocuments,candidates,state,businessStore,reviewedAliases:reviewedFreightAliases(businessStore,model.allDocuments,model.repairOverlay)});
 assert.equal(smart.folders.length,1);const folder=smart.folders[0];
 assert.equal(folder.reference,'31450-11788');assert.equal(folder.shipment,false);assert.equal(folder.completed,true);
 assert.ok(folderChecklist(folder).find(row=>row.kind==='rate_confirmation').files.some(d=>d.id==='ratecon'));
 assert.equal(folder.documents.length,3);assert.equal(folder.logs[0].day,'2026-11-04');assert.equal(folder.logs[0].signed,true);
 assert.deepEqual({state,businessStore},before,'inspection, duty records, signatures and stored documents remain unchanged');
});
