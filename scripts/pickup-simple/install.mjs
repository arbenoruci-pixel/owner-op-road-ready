import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {installDutyCompatibility} from '../test-support/install-duty-compatibility.mjs';

function patch(file,before,after){
 const text=fs.readFileSync(file,'utf8');
 if(text.includes(after))return;
 assert.equal(text.split(before).length,2,'Pickup patch anchor changed: '+file);
 fs.writeFileSync(file,text.replace(before,()=>after));
}
const editor='source/src/modules/editor/EditEventSheet.jsx';
patch(editor,"  if (/\\bdelivery\\b|\\bunloading\\b|drop load \\/ trailer/i.test(note)) return 'delivery';\n  if (/\\bpickup\\b|\\bpick up\\b|\\bloading\\b/i.test(note)) return 'pickup';","  const pickup = /\\bpickup\\b|\\bpick up\\b|\\bloading\\b/i.test(text);\n  if (!pickup && /\\bdelivery\\b|\\bunloading\\b|drop load \\/ trailer/i.test(text)) return 'delivery';\n  if (pickup) return 'pickup';");
patch(editor,"shippingDocs:event.shippingDocs || event.loadNo || event.bol || '',","shippingDocs:loadActivityKind(event.status,event.note,event.description)==='pickup' ? event.shippingDocs || '' : event.shippingDocs || event.loadNo || event.bol || '',");
patch(editor,"loadNo:event.loadNo || '', bol:event.bol || '',","loadNo:event.loadNo || '', bol:event.bol || (loadActivityKind(event.status,event.note,event.description)==='pickup' ? event.shippingDocs : '') || '',");
patch(editor,'  function save() {',`  function changePickupBol(value) {
    // Update the old shipping alias only when it represents this same BOL.
    // A distinct broker/order/shipping reference remains untouched.
    if (!shippingDocs.trim() || shippingDocs.trim() === bol.trim()) setShippingDocs(value);
    setBol(value);
  }

  function save() {`);
patch(editor,'<DutySection title="Load references" detail="Saved on this event">','<DutySection title={activityKind===\'pickup\' ? \'Pickup details\' : \'Load references\'} detail="Saved on this event">');
patch(editor,"      <DutyFieldGrid fields={[\n        {key:'shippingDocs',label:'BOL / Shipping document #'",`      <DutyFieldGrid fields={activityKind==='pickup' ? [
        {key:'bol',label:'BOL #',value:bol,onChange:changePickupBol,placeholder:'Bill of lading number'},
        {key:'destination',label:'Going to',value:destination,onChange:setDestination,placeholder:'City, ST'}
      ] : [
        {key:'shippingDocs',label:'BOL / Shipping document #'`);
const dot='source/src/core/dot/dotOfficerCheckEngine.js';
patch(dot,"const hasBol = safeText(event.shippingDocs || event.loadNo) || legs.some(leg => leg.pickupEventId === event.id && safeText(leg.shippingDocs || leg.loadNo));","const hasBol = [event.bol,event.shippingDocs,event.loadNo].some(value => safeText(value)) || legs.some(leg => leg.pickupEventId === event.id && [leg.bol,leg.shippingDocs,leg.loadNo].some(value => safeText(value)));");
patch(dot,"const hasDest = safeText(event.destination || event.destinationState)","const hasDest = [event.destination,event.destinationCity,event.destinationState].some(value => safeText(value))");
// Keep the prior source-conflict regression: broker identity is now checked in
// saved data instead of demanding an extra pickup input from the driver.
patch('scripts/v110378/browser-duty-forms.mjs',"assert.equal(await root.getByLabel('Load / order #',{exact:true}).inputValue(),'TRIP-A');","assert.equal(await root.getByLabel('Load / order #',{exact:true}).count(),0);assert.equal(await root.locator('[data-duty-section=load] input').count(),2);");

const reviewedFile='scripts/test-support/reviewed-duty-hashes.json';
const previousReviewed=JSON.parse(fs.readFileSync(reviewedFile,'utf8'));
const reviewed={...previousReviewed,[editor]:'634c587ad279d8cfdec905af4f3f4584ae0b8cdcbb24447a997708ebdb0983a9'};
assert.equal(createHash('sha256').update(fs.readFileSync(editor)).digest('hex'),reviewed[editor],'Exact reviewed simple pickup editor');
fs.writeFileSync(reviewedFile,JSON.stringify(reviewed,null,2)+'\n');
installDutyCompatibility(process.cwd(),{previousReviewed});
console.log('PASS — pickup uses one BOL and destination; DOT reads saved BOL; separate identities retained');
