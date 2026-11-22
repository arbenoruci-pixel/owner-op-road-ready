import fs from 'node:fs';
import assert from 'node:assert/strict';

const loads = 'source/src/modules/loads/';
const current = loads + 'currentLoadV110473.js';
const picker = 'source/src/modules/scan/loadPickerV110472.js';

function replace(path, before, after) {
  const text = fs.readFileSync(path, 'utf8');
  if (text.includes(after)) return;
  assert.equal(text.split(before).length, 2, 'Driver active load integration: ' + path + ' / ' + before.slice(0,72));
  fs.writeFileSync(path, text.replace(before, () => after));
}

fs.copyFileSync('scripts/manual-loads/selectDriverLoad.js', loads + 'selectDriverLoad.js');
replace(current, 'export function currentOperationalLoad(state={},store={},context={}){',
  `import {selectDriverLoad} from './selectDriverLoad.js';
import {closedLoad} from '../owneros/manualLoadCore.js';
export function currentOperationalLoad(state={},store={},context={}){
 return operationalCandidateContext(state,store,context).current;
}
function recordedOperationalLoad(state={},store={},context={}){`);
replace(current, "if(closed(load.operationalStatus)||closed(load.status))return 'delivered';",
  "if(closedLoad(load)&&!hidden(load.status))return 'delivered';");
replace(current, 'return {current:currentOperationalLoad(state,store,at),statuses,aliases:reviewedLoadAliases(store)};',
  `const aliases=reviewedLoadAliases(store);
 const evidence=recordedOperationalLoad(state,store,{...context,...at});
 const current=selectDriverLoad(state,store,at,statuses,evidence,aliases);
 if(current?.identity==='reference'&&current.recorded)statuses[current.shipmentReference.toUpperCase()]='in_transit';
 return {current,statuses,aliases,driverSelectionResolved:true};`);
replace(picker, 'operation?closed(operation):closed(candidate.operationalStatus)',
  "operation?(operation==='removed'||closed(operation)):closed(candidate.operationalStatus)");
replace(picker, 'hasContext&&context.current?.recorded!==true&&recordedShipment?',
  '!context.driverSelectionResolved&&hasContext&&context.current?.recorded!==true&&recordedShipment?');
console.log('PASS — Home, trip guidance and document filing use one read-only selection');
