import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

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
  await import(`${pathToFileURL(path.join(ROOT, 'scripts/verify-gate-pass-v1052.mjs')).href}?verify=${Date.now()}`);
} else {
  const sourcePath = path.join(ROOT, 'scripts/materialize-v1052-gate-pass.mjs');
  const runtimePath = path.join(ROOT, 'scripts/.materialize-v1052-gate-pass-runtime.mjs');
  let source = fs.readFileSync(sourcePath, 'utf8');

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
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
}
