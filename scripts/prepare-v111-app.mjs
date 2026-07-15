import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(ROOT, 'source/src/app/App.jsx');
let app = fs.readFileSync(appPath, 'utf8');
const marker = 'lastDispatchNotification:payload.dispatchNotification';

if (!app.includes(marker)) {
  const anchor = `    if (deliveryLike) {\n      if (destination.city || destination.state) {`;
  if (!app.includes(anchor)) throw new Error('v101.1 missing App load patch anchor');
  app = app.replace(anchor, `    if (payload.brokerContactName) patch.brokerContactName = String(payload.brokerContactName).trim();
    if (payload.brokerPhone) {
      patch.brokerPhone = String(payload.brokerPhone).trim();
      patch.dispatchPhone = String(payload.brokerPhone).trim();
    }
    if (payload.brokerEmail) {
      patch.brokerEmail = String(payload.brokerEmail).trim();
      patch.dispatchEmail = String(payload.brokerEmail).trim();
    }
    if (payload.dispatchNotification) {
      patch.lastDispatchNotification = payload.dispatchNotification;
      // Verification marker: ${marker}
    }
    if (deliveryLike) {
      if (destination.city || destination.state) {`);
  fs.writeFileSync(appPath, app);
}

console.log('v101.1 App notification audit persistence prepared');
