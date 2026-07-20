import fs from 'node:fs';
const target='scripts/patch-v1076-real-scanbot-rtu.mjs';
let source=fs.readFileSync(target,'utf8');
source=source.replace("options.onStatus?.(`Preparing page ${index + 1}…`);", "options.onStatus?.('Preparing page ' + (index + 1) + '…');");
source=source.replace("`road-ready-scanbot-original-${index + 1}.jpg`", "'road-ready-scanbot-original-' + (index + 1) + '.jpg'");
source=source.replace("`road-ready-scanbot-cleaned-${index + 1}.jpg`", "'road-ready-scanbot-cleaned-' + (index + 1) + '.jpg'");
fs.writeFileSync(target,source);
console.log('v107.6 runtime template escaping prepared');
