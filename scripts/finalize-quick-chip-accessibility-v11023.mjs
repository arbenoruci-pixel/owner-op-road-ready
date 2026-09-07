// Explicit names keep decorative selection marks out of the accessible label.
// A selected chip stays addressable by the same name for toggling it off.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const label="{reason === 'Pre-trip inspection' ? 'PTI' : reason === 'Pickup / Loading' ? 'Pickup' : reason === 'Delivery / Unloading' ? 'Delivery' : reason === 'Hook Empty / Reposition' ? 'Reposition' : reason}";
for (const name of ['EditEventSheet','InsertEditEventSheet']) {
  const path=`source/src/modules/editor/${name}.jsx`;
  let source=fs.readFileSync(path,'utf8');
  if (source.includes('// QUICK_CHIP_ACCESSIBILITY_V11023')) continue;
  const anchor=/^(\s*)title=\{reason\}$/gm;
  assert.equal([...source.matchAll(anchor)].length,1,name+' quick-chip title anchor changed');
  source=source.replace(anchor,(_,indent)=>`${indent}title={reason}\n${indent}aria-label=${label}`);
  fs.writeFileSync(path,'// QUICK_CHIP_ACCESSIBILITY_V11023\n'+source);
}
const path='source/src/modules/editor/compact-editor-v111.css';
let css=fs.readFileSync(path,'utf8');
if (!css.includes('QUICK_CHIP_SINGLE_CHECK_V11023')) css+=`
/* QUICK_CHIP_SINGLE_CHECK_V11023: the real aria-hidden check is already rendered. */
.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .reason-pills button::after,
.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .insert-reason-grid button::after{content:none!important;display:none!important}
`;
fs.writeFileSync(path,css);
console.log('PASS — stable quick-chip accessible names and one visible selected check');
