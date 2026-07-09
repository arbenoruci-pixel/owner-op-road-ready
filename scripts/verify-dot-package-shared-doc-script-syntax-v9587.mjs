import fs from 'node:fs';
import vm from 'node:vm';

const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');

if (!dot.includes("new RegExp('^data:image/', 'i')")) {
  throw new Error('image data-url detection must use RegExp constructor to survive exported HTML template escaping');
}
if (!dot.includes("new RegExp('^data:application/pdf', 'i')")) {
  throw new Error('pdf data-url detection must use RegExp constructor to survive exported HTML template escaping');
}
if (dot.includes('/^data:image\\//i.test(src)') || dot.includes('/^data:application\\/pdf/i.test(src)')) {
  throw new Error('fragile template regex literals must not be used in exported viewer script');
}

const scriptMatch = dot.match(/function roadsideDocumentViewerScriptHtml\(\) \{\n  return `([\s\S]*?)`;\n\}/);
if (!scriptMatch) throw new Error('roadsideDocumentViewerScriptHtml template not found');
const htmlScript = scriptMatch[1]
  .replace(/^<script>\n?/, '')
  .replace(/\n?<\/script>$/, '');

try {
  new vm.Script(htmlScript);
} catch (error) {
  throw new Error(`exported DOT document viewer script is not valid JavaScript: ${error.message}`);
}

console.log('verify-dot-package-shared-doc-script-syntax-v9587: PASS');
