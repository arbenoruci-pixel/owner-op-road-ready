import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const absolute = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(absolute(relative), 'utf8');
const write = (relative, value) => fs.writeFileSync(absolute(relative), value);

// The legacy prebuild chain reaches the latest release more than once in separate
// Node processes. Once every v105.2 runtime marker exists, verify the generated
// source again instead of attempting to patch it a second time.
const alreadyMaterialized = [
  ['source/src/modules/scan/truckDocumentCatalogV1040.js', "t('gate_pass'"],
  ['source/src/modules/scan/truckDocumentEngineV1040.js', 'arbitrateGatePassV1052'],
  ['source/src/modules/scan/SmartScanSheetV105.jsx', 'road-ready:open-status-activity-v1052'],
  ['source/src/modules/status/StatusWorkflowSheet.jsx', 'generic-trailer-action-v1052'],
  ['source/src/modules/status/StatusWorkflowSheet.jsx', 'Hook / Pickup Trailer'],
  ['source/src/app/App.jsx', 'isHookTrailerReasonV1052'],
  ['source/src/app/App.jsx', 'road-ready:open-status-activity-v1052'],
  ['public/app-version.json', '105.2.0'],
].every(([relative, marker]) => {
  try { return read(relative).includes(marker); } catch { return false; }
});

if (alreadyMaterialized) {
  await import(`${pathToFileURL(absolute('scripts/verify-gate-pass-v1052.mjs')).href}?verify=${Date.now()}`);
} else {
  const sourcePath = absolute('scripts/materialize-v1052-gate-pass.mjs');
  const runtimePath = absolute('scripts/.materialize-v1052-gate-pass-runtime.mjs');
  const statusPath = 'source/src/modules/status/StatusWorkflowSheet.jsx';
  const onDutyValidation = "  function save() {\n    if (status === 'ON' && !reasonText(selectedReasons)) {\n      setGpsStatus('Choose at least one ON DUTY activity.');\n      return;\n    }\n";
  let statusWasPrepared = false;
  let source = fs.readFileSync(sourcePath, 'utf8');

  // v104.3 inserts its ON DUTY validation at the same anchor used by v105.2.
  // Temporarily expose the stable Drop Off anchor, then restore the validation
  // after v105.2 has added the trailer checks. No runtime behavior is removed.
  let status = read(statusPath);
  if (status.includes(onDutyValidation)) {
    status = status.replace(onDutyValidation, '  function save() {\n');
    write(statusPath, status);
    statusWasPrepared = true;
  }

  // The source materializer embeds App JSX/JS inside template literals. Convert
  // the two generated note expressions to concatenation before Node parses the
  // runtime copy, so the generated App still receives the same exact text.
  source = source
    .replace(
      "        note = dropped ? `Drop Load / Trailer · Trailer ${dropped}` : 'Drop Load / Trailer';",
      "        note = dropped ? 'Drop Load / Trailer · Trailer ' + dropped : 'Drop Load / Trailer';",
    )
    .replace(
      "        note = hooked ? `Hook / Pickup Trailer · Trailer ${hooked}` : 'Hook / Pickup Trailer';",
      "        note = hooked ? 'Hook / Pickup Trailer · Trailer ' + hooked : 'Hook / Pickup Trailer';",
    );

  fs.writeFileSync(runtimePath, source);
  try {
    await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
  } finally {
    if (statusWasPrepared) {
      let generatedStatus = read(statusPath);
      if (!generatedStatus.includes("Choose at least one ON DUTY activity.")) {
        generatedStatus = generatedStatus.replace('  function save() {\n', onDutyValidation);
        write(statusPath, generatedStatus);
      }
    }
  }
}
