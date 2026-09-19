// One activity vocabulary for live status, edit and insert. Existing notes are
// preserved unless the driver deliberately edits an activity.
export const DUTY_LABELS = {OFF:'Off duty',SB:'Sleeper berth',D:'Driving',ON:'On duty'};
export const ON_ACTIVITIES = ['Pre-trip inspection','Fuel','Pickup / Loading','Delivery / Unloading','Waiting'];
export const TRAILER_ACTIVITIES = ['Drop Load / Trailer','Hook / Pickup Trailer'];
export const INTERMODAL_ACTIVITIES = ['Drop Off','Drop & Hook','Hook Empty / Reposition'];
export const text = v => String(v ?? '').trim();
export function dutyActivities(status, intermodal = false) {
  if(status==='ON')return [...ON_ACTIVITIES,...(intermodal?INTERMODAL_ACTIVITIES:TRAILER_ACTIVITIES)];
  if(status==='OFF')return ['Off Duty','Break','Parking','Personal Conveyance'];
  if(status==='SB')return ['Sleeper Berth','Rest'];
  return ['Driving','Yard Move'];
}
export function parseDutyActivities(note = '', extra = []) {
  const known=[...ON_ACTIVITIES,...TRAILER_ACTIVITIES,...INTERMODAL_ACTIVITIES];
  const selected=[],details=[];
  for(const part of text(note).split(/\s*[·•|]\s*/).filter(Boolean)){
    const match=known.find(x=>x.toLowerCase()===part.toLowerCase()) || (/^(?:pti|pre[- ]?trip(?: inspection)?)$/i.test(part)?'Pre-trip inspection':null);
    if(match){if(!selected.includes(match))selected.push(match);}else details.push(part);
  }
  for(const part of Array.isArray(extra)?extra:[]){
    const match=known.find(x=>x.toLowerCase()===text(part).toLowerCase());
    if(match&&!selected.includes(match))selected.push(match);
  }
  return {selected,details};
}
export function eventActivities(event = {}) {
  return event.status==='ON'?parseDutyActivities(event.note,event.reasons).selected:[];
}
export function realEquipment(value) {
  const v=text(value).replace(/^Trailer\s+/i,'');
  return /^(?:no (?:trailer|equipment)|none|n\/?a)$/i.test(v)?'':v;
}
export {isRoutePlaceHeading as isPlaceHeading} from '../../core/routes/shipmentIdentityV110378.js';
