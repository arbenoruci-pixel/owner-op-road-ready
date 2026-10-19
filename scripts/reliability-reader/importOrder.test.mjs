import assert from 'node:assert/strict';
import {moduleDirectiveFirst, prependModuleImport} from './importOrder.mjs';

for (const quote of ["'", '"']) {
  const directive = `${quote}use client${quote};\n`;
  const baseline = directive + 'export const ready=true;\n';
  const initial = prependModuleImport(baseline, "import Dexie from 'dexie';");
  assert.ok(initial.startsWith(directive));
  assert.equal(moduleDirectiveFirst(initial), initial);
  const broken = "import Dexie from 'dexie';\n" + baseline;
  assert.equal(moduleDirectiveFirst(broken), initial);
  assert.equal(moduleDirectiveFirst(moduleDirectiveFirst(broken)), initial);
}
assert.equal(prependModuleImport('export const ready=true;\n', "import Dexie from 'dexie';"), "import Dexie from 'dexie';\nexport const ready=true;\n");
assert.throws(() => moduleDirectiveFirst("doWork();\n'use client';\n"), /executable code/);
console.log('PASS — module directives precede imports on initial and repeated installation');
