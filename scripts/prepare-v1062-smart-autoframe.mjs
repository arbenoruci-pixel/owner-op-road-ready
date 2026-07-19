import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v106.2 missing ${label}`);
  return content.replace(before, after);
}

const assetPath = 'scripts/v106-assets/webScannerAdapterV106.js.gz.b64';
let web = gunzipSync(Buffer.from(read(assetPath), 'base64')).toString('utf8');

if (!web.includes('paper-text-fusion-v1062')) {
  const helpers = `// paper-text-fusion-v1062\nexport function candidateEdgeTouchCountV106(candidate = {}) {\n  const bounds = candidate.bounds || contourBoundsV106(candidate.contour);\n  return [\n    bounds.left <= .018,\n    bounds.top <= .018,\n    bounds.right >= .982,\n    bounds.bottom >= .982,\n  ].filter(Boolean).length;\n}\n\nexport function isPlausibleDocumentCandidateV106(candidate = {}, source = candidate?.source || '') {\n  if (!candidate || candidate.fullPhoto) return false;\n  const bounds = candidate.bounds || contourBoundsV106(candidate.contour);\n  const area = Number(bounds.area || (bounds.width * bounds.height) || 0);\n  const edgeTouches = candidateEdgeTouchCountV106(candidate);\n  const aspect = bounds.height > 0 ? bounds.width / bounds.height : 0;\n  if (bounds.width < .16 || bounds.height < .16 || area < .035) return false;\n  if (area > .91 || edgeTouches >= 3) return false;\n  if (aspect < .24 || aspect > 5.4) return false;\n  if (source === 'text-density') {\n    if (area > .72 || edgeTouches >= 2) return false;\n    if (Number(candidate.metrics?.clippingRisk || 0) > .55) return false;\n  }\n  if ((source === 'edge-density' || source === 'saliency') && area > .82 && edgeTouches >= 2) return false;\n  if (source === 'paper-segmentation' && Number(candidate.metrics?.rectangleConfidence || 0) < .16) return false;\n  return true;\n}\n\nfunction boundsIntersectionV106(left = {}, right = {}) {\n  const x1 = Math.max(Number(left.left || 0), Number(right.left || 0));\n  const y1 = Math.max(Number(left.top || 0), Number(right.top || 0));\n  const x2 = Math.min(Number(left.right || 0), Number(right.right || 0));\n  const y2 = Math.min(Number(left.bottom || 0), Number(right.bottom || 0));\n  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);\n}\n\nfunction centerInsideBoundsV106(inner = {}, outer = {}) {\n  const x = (Number(inner.left || 0) + Number(inner.right || 0)) / 2;\n  const y = (Number(inner.top || 0) + Number(inner.bottom || 0)) / 2;\n  return x >= Number(outer.left || 0) && x <= Number(outer.right || 0)\n    && y >= Number(outer.top || 0) && y <= Number(outer.bottom || 0);\n}\n\nexport function resolveTextCandidateV106(textCandidate, paperCandidates = []) {\n  if (!isPlausibleDocumentCandidateV106(textCandidate, 'text-density')) return null;\n  const textBounds = textCandidate.bounds || contourBoundsV106(textCandidate.contour);\n  const textArea = Math.max(1e-6, Number(textBounds.area || textBounds.width * textBounds.height || 0));\n  const papers = (paperCandidates || []).filter(candidate => isPlausibleDocumentCandidateV106(candidate, 'paper-segmentation'));\n  const matches = papers.map(paper => {\n    const paperBounds = paper.bounds || contourBoundsV106(paper.contour);\n    const intersection = boundsIntersectionV106(textBounds, paperBounds);\n    return {\n      paper,\n      containment:intersection / textArea,\n      centerInside:centerInsideBoundsV106(textBounds, paperBounds),\n    };\n  }).sort((left, right) => right.containment - left.containment || Number(right.paper.score || 0) - Number(left.paper.score || 0));\n  const best = matches[0] || null;\n  if (best && (best.containment >= .46 || best.centerInside && best.containment >= .24)) {\n    const paper = best.paper;\n    const metrics = {\n      ...(paper.metrics || {}),\n      textContained:Math.max(Number(paper.metrics?.textContained || 0), .84),\n      wordCountProbability:Math.max(Number(paper.metrics?.wordCountProbability || 0), .86),\n      pageLayoutProbability:Math.max(Number(paper.metrics?.pageLayoutProbability || 0), .82),\n      backgroundSeparation:Math.max(Number(paper.metrics?.backgroundSeparation || 0), .62),\n      clippingRisk:Math.min(Number(paper.metrics?.clippingRisk || 0), .22),\n    };\n    return createDocumentCandidateV106({\n      ...paper,\n      id:null,\n      source:'paper-text-fusion',\n      label:'Document edge with text',\n      metrics,\n      score:clamp01V106(Math.max(Number(paper.score || 0), Number(textCandidate.score || 0)) + .065),\n    });\n  }\n  if (papers.length) return null;\n  return createDocumentCandidateV106({\n    ...textCandidate,\n    id:null,\n    label:'Text region — verify paper edge',\n    score:Math.min(.56, Number(textCandidate.score || 0)),\n    metrics:{\n      ...(textCandidate.metrics || {}),\n      clippingRisk:Math.max(.16, Number(textCandidate.metrics?.clippingRisk || 0)),\n    },\n  });\n}\n\n`;
  web = replaceOnce(web, 'function fullPhotoCandidateV106() {', `${helpers}function fullPhotoCandidateV106() {`, 'candidate plausibility helpers');

  web = replaceOnce(
    web,
    "        if (candidate) candidates.push(candidate);",
    "        if (candidate && isPlausibleDocumentCandidateV106(candidate, 'rectangle-detection')) candidates.push(candidate);",
    'rectangle candidate plausibility gate',
  );

  const oldSignals = `      candidates.push(...paperCandidatesV106(grid));\n      const gradientThreshold = grid.gradientStats.mean + Math.max(16, grid.gradientStats.std * .78);\n      const edge = boundingCandidateFromMaskV106(grid, index => grid.gradients[index] >= gradientThreshold, 'edge-density', 'Strong edge region', .055);\n      if (edge) candidates.push(edge);\n      const darkThreshold = grid.stats.mean - Math.max(22, grid.stats.std * .42);\n      const text = boundingCandidateFromMaskV106(grid, index => grid.luma[index] <= darkThreshold && grid.gradients[index] >= grid.gradientStats.mean, 'text-density', 'Text layout region', .075);\n      if (text) candidates.push(text);\n      const borderValues = [];`;
  const newSignals = `      const paperCandidates = paperCandidatesV106(grid)\n        .filter(candidate => isPlausibleDocumentCandidateV106(candidate, 'paper-segmentation'));\n      candidates.push(...paperCandidates);\n      const gradientThreshold = grid.gradientStats.mean + Math.max(16, grid.gradientStats.std * .78);\n      const edge = boundingCandidateFromMaskV106(grid, index => grid.gradients[index] >= gradientThreshold, 'edge-density', 'Strong edge region', .055);\n      if (edge && isPlausibleDocumentCandidateV106(edge, 'edge-density')) candidates.push(edge);\n      const darkThreshold = grid.stats.mean - Math.max(22, grid.stats.std * .42);\n      const text = boundingCandidateFromMaskV106(grid, index => grid.luma[index] <= darkThreshold && grid.gradients[index] >= grid.gradientStats.mean, 'text-density', 'Text layout region', .075);\n      const resolvedText = resolveTextCandidateV106(text, paperCandidates);\n      if (resolvedText) candidates.push(resolvedText);\n      const borderValues = [];`;
  web = replaceOnce(web, oldSignals, newSignals, 'paper and text candidate fusion');

  web = replaceOnce(
    web,
    "      if (saliency) candidates.push(saliency);",
    "      if (saliency && isPlausibleDocumentCandidateV106(saliency, 'saliency')) candidates.push(saliency);",
    'saliency plausibility gate',
  );
}

write(assetPath, gzipSync(Buffer.from(web), { mtime:0 }).toString('base64'));

const geometryPath = 'source/src/modules/scan/captureGeometryV106.js';
let geometry = read(geometryPath);
if (!geometry.includes('smart-autoframe-score-v1062')) {
  geometry = replaceOnce(
    geometry,
    "    pageLayoutProbability:clamp01V106(metrics.pageLayoutProbability),\n  };\n  const positive = (",
    "    pageLayoutProbability:clamp01V106(metrics.pageLayoutProbability),\n    clippingRisk:clamp01V106(metrics.clippingRisk),\n  };\n  const areaFit = values.documentArea < .055\n    ? values.documentArea / .055\n    : values.documentArea > .9\n      ? clamp01V106((1 - values.documentArea) / .1)\n      : 1; // smart-autoframe-score-v1062\n  const positive = (",
    'candidate clipping and area-fit values',
  );
  geometry = replaceOnce(
    geometry,
    '    values.documentArea * .12',
    '    areaFit * .12',
    'candidate area-fit scoring',
  );
  geometry = replaceOnce(
    geometry,
    '  const penalty = values.textCutOff * .24;',
    "  const overfillPenalty = Math.max(0, values.documentArea - .82) * .72;\n  const penalty = values.textCutOff * .24 + values.clippingRisk * .32 + overfillPenalty;",
    'candidate clipping penalty',
  );
}
write(geometryPath, geometry);

const contractsPath = 'source/src/modules/scan/scannerContractsV106.js';
let contracts = read(contractsPath);
contracts = contracts.replace("export const ROAD_READY_SCANNER_VERSION_V106 = '106.0.0';", "export const ROAD_READY_SCANNER_VERSION_V106 = '106.2.0';");
write(contractsPath, contracts);

console.log('v106.2 smart autoframe assets prepared');
