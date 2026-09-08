import assert from 'node:assert/strict';
import { matchDocumentToLoadV105 } from '../source/src/modules/documents/documentFoundationV105.js';

function stateWithLoad(broker='Red Lightning Logistics'){
  return {
    loadInfo:{
      loadNo:'38246703',
      shippingDocs:'38246703',
      canonicalLoadId:'load_38246703',
      broker,
      pickupCity:'Howe',
      pickupState:'IN',
      deliveryCity:'Smithfield',
      deliveryState:'RI',
      pickupDate:'2026-09-08',
      deliveryDate:'2026-09-10',
      updatedAt:Date.now(),
    },
    eventsByDay:{},
    routeLegsByDay:{},
    loadGuidesById:{},
  };
}

const tqlText=`DRIVER/CARRIER INFORMATION SHEET TQL PO# 38246703
TQL CONTACT INFO
Carlos Branson 800-580-3101 TeamBranson@tql.com
Pickup Dates 9/8/26 Delivery Dates 9/10/26
THERMA TRU Howe IN
REEB MILLWORK OF NEW ENGLAND Smithfield RI
TQL PO# 38246703`;

const fields={
  loadNo:'38246703',
  poNumber:'38246703',
  broker:'Total Quality Logistics (TQL)',
  origin:'Howe, IN',
  destination:'Smithfield, RI',
  pickupDate:'09/08/2026',
  deliveryDate:'09/10/2026',
};

const conflict=matchDocumentToLoadV105({
  state:stateWithLoad('Red Lightning Logistics'),
  businessStore:{loads:[],documents:[]},
  typeId:'rate_confirmation',
  fields,
  analysis:{fields,text:tqlText},
});
assert.equal(conflict.loadNo,'','TQL Rate Con must never auto-select a Red Lightning load with the same numeric reference');
assert.equal(conflict.automatic,false,'broker conflict must never be automatic');
assert.equal(conflict.requiresConfirmation,true);
assert.match(conflict.reason,/Broker identity/i);

const textOnlyIdentity=matchDocumentToLoadV105({
  state:stateWithLoad('Red Lightning Logistics'),
  businessStore:{loads:[],documents:[]},
  typeId:'rate_confirmation',
  fields:{...fields,broker:''},
  analysis:{fields:{...fields,broker:''},text:tqlText},
});
assert.equal(textOnlyIdentity.loadNo,'','TQL header/contact evidence must protect against a wrong broker even when a Broker field is absent');
assert.equal(textOnlyIdentity.automatic,false);
assert.equal(textOnlyIdentity.requiresConfirmation,true);
assert.match(textOnlyIdentity.reason,/Broker identity/i);

console.log('PASS — v110.3.3 broker-conflict fail-closed regression tests');
