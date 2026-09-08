import assert from 'node:assert/strict';
import { matchDocumentToLoadV105 } from '../source/src/modules/documents/documentFoundationV105.js';

function storeWithLoad(broker='Red Lightning Logistics'){
  return {
    loads:[{
      id:'load_38246703',
      canonicalLoadId:'load_38246703',
      canonicalLoadNo:'38246703',
      loadNo:'38246703',
      broker,
      origin:'Howe, IN',
      destination:'Smithfield, RI',
      pickupDate:'2026-09-08',
      deliveryDate:'2026-09-10',
      status:'booked',
      aliases:[{kind:'po_number',value:'38246703'}],
      updatedAt:Date.now(),
    }],
    documents:[],
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
  state:{},
  businessStore:storeWithLoad('Red Lightning Logistics'),
  typeId:'rate_confirmation',
  fields,
  analysis:{fields,text:tqlText},
});
assert.equal(conflict.loadNo,'','TQL Rate Con must not auto-select a Red Lightning folder with the same PO/load number');
assert.equal(conflict.automatic,false,'broker conflict must never be automatic');
assert.equal(conflict.requiresConfirmation,true);
assert.match(conflict.reason,/Broker identity/i);

const matching=matchDocumentToLoadV105({
  state:{},
  businessStore:storeWithLoad('Total Quality Logistics'),
  typeId:'rate_confirmation',
  fields,
  analysis:{fields,text:tqlText},
});
assert.equal(matching.loadNo,'38246703');
assert.equal(matching.automatic,true,'same broker plus exact reference/route/date evidence should remain a strong match');
assert.ok(matching.confidence>=.95);
assert.match(matching.reason,/Broker identity matches/i);

const textOnlyIdentity=matchDocumentToLoadV105({
  state:{},
  businessStore:storeWithLoad('Red Lightning Logistics'),
  typeId:'rate_confirmation',
  fields:{...fields,broker:''},
  analysis:{fields:{...fields,broker:''},text:tqlText},
});
assert.equal(textOnlyIdentity.loadNo,'','TQL header/contact evidence must protect against a wrong broker even when Broker: is absent');
assert.equal(textOnlyIdentity.automatic,false);

const noBrokerEvidence=matchDocumentToLoadV105({
  state:{},
  businessStore:storeWithLoad('Red Lightning Logistics'),
  typeId:'bol',
  fields:{loadNo:'38246703',destination:'Smithfield, RI'},
  analysis:{fields:{loadNo:'38246703',destination:'Smithfield, RI'},text:'BILL OF LADING Load # 38246703 Smithfield RI'},
});
assert.equal(noBrokerEvidence.loadNo,'38246703','non-Rate-Con evidence without broker identity keeps legacy load matching behavior');

console.log('PASS — v110.3.3 smart load identity regression tests');
