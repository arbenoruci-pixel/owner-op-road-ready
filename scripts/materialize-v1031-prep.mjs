import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sheetPath = path.join(ROOT, 'source/src/modules/scan/SmartScanSheetV100.jsx');
let sheet = fs.readFileSync(sheetPath, 'utf8');
const guard = `      if (meta.id === 'pod' && !loadNo) {
        setSaveError('POD needs a Load # before it can enter Billing / Factoring.');
        setStage('review');
        return;
      }
      if (meta.id === 'pod' && fields.podSigned !== true) {
        setSaveError('Confirm that the receiver signature or RECEIVED stamp is visible before saving this as a POD.');
        setStage('review');
        return;
      }
      const stored = await saveScannedDocument({`;
if (!sheet.includes(guard)) {
  const marker = '      const stored = await saveScannedDocument({';
  if (!sheet.includes(marker)) throw new Error('v103.1 prep missing saveScannedDocument marker');
  sheet = sheet.replace(marker, guard);
  fs.writeFileSync(sheetPath, sheet);
}
await import('./materialize-v1031.mjs');
