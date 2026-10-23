import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
const {default:Editor}=await import('../../source/src/modules/editor/EditEventSheet.jsx');
const day='2026-10-22';
for(const bol of ['BOL-A','04','']) {
  const event={id:'pickup',status:'ON',startMin:60,endMin:90,city:'Chicago',state:'IL',source:'manual',note:'Pickup / Loading',reasons:['Pickup / Loading'],description:'Recorded pickup',bol,shippingDocs:'SHIP-A',loadNo:'LOAD-A',destination:'Destination, WI',destinationState:'WI',loadDetailsExplicit:true};
  const state={activeDay:day,currentStatus:'OFF',homeTerminalTimeZone:'America/New_York',equipment:{type:'dry_van'},eventsByDay:{[day]:[
    {id:'rest',status:'OFF',startMin:0,endMin:60,city:'Chicago',state:'IL',note:'Off Duty'},event,
    {id:'off',status:'OFF',startMin:90,endMin:1440,city:'Chicago',state:'IL',note:'Off Duty'},
  ]},routeLegsByDay:{},signatureByDay:{},certifyStatus:{},loadInfo:{},loadGuidesById:{}};
  const before=structuredClone(state);
  const html=renderToStaticMarkup(React.createElement(Editor,{event,events:state.eventsByDay[day],logbookContext:state}));
  assert.equal([...html.matchAll(/aria-label="BOL #"/g)].length,1);
  assert.match(html,new RegExp('aria-label="BOL #"[^>]*value="'+bol+'"'));
  assert.doesNotMatch(html,/Load references|BOL \/ Shipping document #|Going to|Load \/ order #|A separate reference/);
  assert.match(html,/save-main[^>]*disabled/,'Opening a record must remain read-only');
  assert.deepEqual(state,before);
}
console.log('PASS — actual recorded editor renders one BOL input, including a short or empty value, without changing saved evidence');
