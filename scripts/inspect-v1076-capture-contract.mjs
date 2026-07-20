import fs from 'node:fs';
const path = 'source/src/modules/scan/SmartDocumentCaptureV106.jsx';
const source = fs.readFileSync(path, 'utf8');
const signature = source.match(/export default function SmartDocumentCaptureV106\s*\(([^)]*)\)/s)?.[1] || 'SIGNATURE_NOT_FOUND';
const callbacks = [...new Set([...source.matchAll(/\b(on[A-Z][A-Za-z0-9_]*)\b/g)].map(match => match[1]))];
const handlers = [...new Set([...source.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)].map(match => match[1]))].filter(name => /capture|import|finish|complete|file|scan/i.test(name));
const around = name => {
  const index = source.indexOf(name);
  return index < 0 ? 'NOT_FOUND' : source.slice(Math.max(0,index-500), Math.min(source.length,index+2600)).replace(/\s+/g,' ');
};
console.log('V1076_CAPTURE_SIGNATURE=' + signature.replace(/\s+/g, ' '));
console.log('V1076_CAPTURE_CALLBACKS=' + callbacks.join(','));
console.log('V1076_CAPTURE_HANDLERS=' + handlers.join(','));
console.log('V1076_FINISH_BLOCK=' + around('async function finish'));
console.log('V1076_CAPTURE_PAGE_BLOCK=' + around('async function capturePage'));
console.log('V1076_INITIAL_FILE_BLOCK=' + around('initialFile'));
