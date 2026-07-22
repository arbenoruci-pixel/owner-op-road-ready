import fs from 'node:fs';

const path = 'scripts/apply-v10964-save-completion-stability.mjs';
let source = fs.readFileSync(path, 'utf8');

const templateBefore = "stop.id || `stop_${index + 1}`";
const templateAfter = "stop.id || ('stop_' + (index + 1))";
if (!source.includes(templateAfter)) {
  if (!source.includes(templateBefore)) throw new Error('v109.6.4 generated helper template anchor missing');
  source = source.replace(templateBefore, templateAfter);
}

source = source.replace(
  "`        preferredType,\n        scanMeta,`,",
  "`        preferredType:requestedType,\n        scanMeta,`,",
);
source = source.replace(
  "`        preferredType,\n        fileName:nextFile.name || scanMeta?.originalFileName || scanMeta?.fileName || '',\n        scanMeta,`,",
  "`        preferredType:requestedType,\n        fileName:nextFile.name || scanMeta?.originalFileName || scanMeta?.fileName || '',\n        scanMeta,`,",
);

fs.writeFileSync(path, source);
console.log('PASS — v109.6.4 generated helper template and V105 requestedType anchor prepared');
