import fs from 'node:fs';
import vm from 'node:vm';

const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
const css = fs.readFileSync('source/src/styles.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const appVersion = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));

function ok(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('OK:', message);
}

ok(pkg.version === '95.95.0', 'package version is 95.95.0');
ok(appVersion.version === '95.95.0', 'remote app version is 95.95.0');
ok(dot.includes('<h2>Send DOT HTML package</h2>'), 'DOT home card is HTML-first');
ok(dot.includes('Share DOT HTML Package'), 'primary HTML share action exists');
ok(dot.includes('Download HTML Package'), 'HTML download action exists');
ok(dot.includes('Open HTML Preview'), 'HTML preview action exists');
ok(!dot.includes('<button className="primary" onClick={shareOfficerPdfFile}>Share DOT Officer PDF</button>'), 'PDF primary button is removed');
ok(!dot.includes('<button onClick={downloadOfficerPdfFile}>Download Officer PDF</button>'), 'PDF download button is removed');
ok(dot.includes('<title>DOT Roadside HTML Package</title>'), 'exported file has DOT HTML title');
ok(dot.includes('class="package-nav"'), 'exported HTML has professional navigation');
ok(dot.includes('id="roadside-documents-index"'), 'exported HTML has document index');
ok(dot.includes('data-roadside-doc="1"'), 'document open action is wired');
ok(dot.includes('roadsideDocumentViewerScriptHtml()'), 'full-screen document viewer is included');
ok(dot.includes('roadside-static-document'), 'inline document fallback is included');
ok(dot.includes('id="logs-index"'), 'logs section navigation exists');
ok(dot.includes('class="daily-log-page"'), 'professional daily log pages exist');
ok(dot.includes('class="log-meta-grid"'), 'professional log metadata layout exists');
ok(dot.includes('class="totals-strip"'), 'professional duty totals exist');
ok(dot.includes('class="event-table-wrap"'), 'professional event detail layout exists');
ok(css.includes('v95.95 DOT HTML package is the primary officer share flow'), 'app HTML-primary UI styles exist');
ok(css.includes('.dot-html-share-primary'), 'primary HTML share button spans the card');
ok(!dot.includes('startMin =') && !dot.includes('endMin ='), 'DOT package does not mutate event times');

const scriptMatch = dot.match(/function roadsideDocumentViewerScriptHtml\(\) \{\n  return `([\s\S]*?)`;\n\}/);
ok(Boolean(scriptMatch), 'document viewer script template is present');
const script = scriptMatch[1].replace(/^<script>\n?/, '').replace(/\n?<\/script>$/, '');
new vm.Script(script);
console.log('OK: exported document viewer script parses');

console.log('verify-dot-html-primary-v9595: PASS');
