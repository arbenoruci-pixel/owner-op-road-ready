import assert from 'node:assert/strict';
import fs from 'node:fs';
import { repairRoadReadyFoundationV105 } from '../source/src/modules/documents/documentFoundationV105.js';
import { repairRoadReadyStateV107 } from '../source/src/core/integrity/logbookIntegrityV107.js';

const items = ['brakes','lights','tires','mirrors','coupling','documents'];

function event(id, note, reasons = []) {
  return {
    id,
    status:'ON',
    startMin:573,
    endMin:591,
    city:'Mounds View',
    state:'MN',
    note,
    description:'Load 391912 · Unloading at Mounds View, MN',
    reasons,
    loadNo:'391912',
    shippingDocs:'391912',
  };
}

const realDay = '2026-07-15';
const realState = {
  eventsByDay:{
    [realDay]:[
      event('real_multi', 'Pre-trip inspection · Delivery / Unloading', ['Delivery / Unloading','Pre-trip inspection']),
    ],
  },
  inspectionByDay:{
    [realDay]:{
      type:'pretrip',
      checked:items,
      complete:true,
      source:'auto_on_duty_pretrip_event',
      sourceEventId:'real_multi',
      sourceStartMin:573,
      sourceEndMin:591,
    },
  },
  certifyStatus:{ [realDay]:'Certified' },
  signatureByDay:{ [realDay]:{ signed:true, signedAt:1 } },
  routeLegsByDay:{},
  loadGuidesById:{},
  loadInfo:{},
};

const realRepaired = repairRoadReadyFoundationV105(realState, { source:'v10955_real_multi' });
assert.equal(realRepaired.eventsByDay[realDay][0].note, 'Delivery / Unloading');
assert.equal(realRepaired.inspectionByDay[realDay]?.complete, true);
assert.equal(realRepaired.inspectionByDay[realDay]?.sourceEventId, 'real_multi');
assert.equal(realRepaired.certifyStatus[realDay], 'Certified');
assert.equal(realRepaired.signatureByDay[realDay]?.needsRecertification, undefined);

const falseDay = '2026-07-17';
const falseState = {
  eventsByDay:{
    [falseDay]:[
      event('false_hidden', 'Pre-trip inspection · Delivery / Unloading', []),
    ],
  },
  inspectionByDay:{
    [falseDay]:{
      type:'pretrip',
      checked:items,
      complete:true,
      source:'auto_on_duty_pretrip_event',
      sourceEventId:'false_hidden',
    },
  },
  certifyStatus:{ [falseDay]:'Certified' },
  signatureByDay:{ [falseDay]:{ signed:true, signedAt:1 } },
  routeLegsByDay:{},
  loadGuidesById:{},
  loadInfo:{},
};

const falseRepaired = repairRoadReadyFoundationV105(falseState, { source:'v10955_false_contamination' });
assert.equal(falseRepaired.eventsByDay[falseDay][0].note, 'Delivery / Unloading');
assert.equal(falseRepaired.inspectionByDay[falseDay], undefined);
assert.equal(falseRepaired.certifyStatus[falseDay], 'Needs Recertification');
assert.equal(falseRepaired.signatureByDay[falseDay]?.needsRecertification, true);

const linkDay = '2026-07-16';
const linkedState = {
  eventsByDay:{
    [linkDay]:[
      event('reason_only_pretrip', 'Delivery / Unloading', ['Delivery / Unloading','Pre-trip inspection']),
    ],
  },
  inspectionByDay:{
    [linkDay]:{
      type:'pretrip',
      checked:items,
      complete:true,
      source:'auto_on_duty_pretrip_event',
      sourceEventId:'reason_only_pretrip',
      sourceStartMin:573,
      sourceEndMin:591,
    },
  },
  routeLegsByDay:{},
  signatureByDay:{},
  certifyStatus:{},
  loadInfo:{},
  loadGuidesById:{},
};

const linkedRepaired = repairRoadReadyStateV107(linkedState, { nowDay:'2026-07-22', source:'v10955_reason_link' });
assert.equal(linkedRepaired.inspectionByDay[linkDay]?.source, 'auto_on_duty_pretrip_event');
assert.equal(linkedRepaired.inspectionByDay[linkDay]?.sourceEventId, 'reason_only_pretrip');
assert.equal(linkedRepaired.inspectionByDay[linkDay]?.complete, true);

const foundationSource = fs.readFileSync('source/src/modules/documents/documentFoundationV105.js', 'utf8');
const integritySource = fs.readFileSync('source/src/core/integrity/logbookIntegrityV107.js', 'utf8');
assert.match(foundationSource, /linkedAutoInspection && !confirmedPretrip/);
assert.match(foundationSource, /structuredPretripReasonV105\(event\)/);
assert.match(integritySource, /\.\.\.reasons, event\?\.note/);

console.log('PASS — v109.5.5 real multi-reason PTI survives v105 foundation cleanup and v107 link repair');
