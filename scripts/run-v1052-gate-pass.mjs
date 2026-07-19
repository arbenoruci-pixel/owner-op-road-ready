import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
