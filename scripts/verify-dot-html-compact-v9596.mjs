import fs from 'node:fs';

const source = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
const start = source.indexOf('function walletReportDocumentPreviewHtml');
const end = source.indexOf('\nfunction walletReportSectionHtml', start);
if (start < 0 || end < 0) throw new Error('Document preview HTML function not found');
const block = source.slice(start, end);

const dataEmbeds = (block.match(/htmlEscape\(dataUrl\)/g) || []).length;
if (dataEmbeds !== 2) throw new Error(`Expected one image branch and one object branch payload embed, found ${dataEmbeds}`);
if (/href="\$\{htmlEscape\(dataUrl\)\}/.test(block)) throw new Error('Document payload is still duplicated in an href');
if (!block.includes('data-roadside-doc="1"')) throw new Error('Full-screen document action is missing');
if (!source.includes('async function optimizeImageDataUrlForHtml')) throw new Error('Large-image export optimization is missing');
if (!source.includes('async function compactStateForDotHtml')) throw new Error('Compact export state builder is missing');
if (!source.includes('async function compactDotHtmlPackage')) throw new Error('Compact HTML package builder is missing');
if (!source.includes('const result = await makeCompactHtmlFile();')) throw new Error('Share/download flow does not use compact package builder');
if (source.includes('const htmlPackage = useMemo(() => reportHtml')) throw new Error('Large HTML package is still eagerly duplicated in component memory');

console.log('verify-dot-html-compact-v9596: PASS');
