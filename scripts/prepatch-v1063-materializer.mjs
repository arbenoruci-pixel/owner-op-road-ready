import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'scripts/prepare-v1063-stable-boundary.mjs');
let source = fs.readFileSync(target, 'utf8');

const replacements = [
  {
    before:"  web = replaceOnce(web, oldPaperCandidate, newPaperCandidate, 'paper segmentation robust quadrilateral');",
    after:`  if (!web.includes('const rawContour = contourFromMeshV106(mesh);')) {
    const paperPattern = /const mesh = meshFromComponentV106\\(component, grid, component\\.maxX - component\\.minX > 45 \\? 24 : 16\\);[\\s\\S]*?metrics:regionMetricsV106\\(component, grid, mesh\\),[\\s\\S]*?\\}\\);/;
    if (!paperPattern.test(web)) throw new Error('v106.3 missing paper segmentation robust quadrilateral');
    web = web.replace(paperPattern, newPaperCandidate.trimStart());
  }`,
    label:'paper candidate',
  },
  {
    before:"  capture = replaceOnce(capture, oldLiveLoop, newLiveLoop, 'temporally stable live candidate');",
    after:`  if (!capture.includes('const chosen = chooseLiveCandidateV1063(found, stableRef.current.candidate);')) {
    const livePattern = /const found = await adapter\\(\\)\\.detectDocumentRegions\\(canvas, \\{ maxDimension:560, gridMax:64 \\}\\);[\\s\\S]*?if \\(autoCapture && count >= 4 && !captureBusyRef\\.current\\) capturePage\\(\\);/;
    if (!livePattern.test(capture)) throw new Error('v106.3 missing temporally stable live candidate');
    capture = capture.replace(livePattern, newLiveLoop.trimStart());
  }`,
    label:'live loop',
  },
  {
    before:`  capture = replaceOnce(
    capture,
    \`        const first = found[0];
        setCandidates(found);
        setSelectedCandidateId(first?.id || '');
        setAutomaticContour(first?.contour || []);
        setContour(first?.contour || []);\`,
    \`        const first = chooseLiveCandidateV1063(found, null) || found[0] || null;
        setCandidates(found);
        setSelectedCandidateId(first?.id || '');
        setAutomaticContour(first?.contour || []);
        setContour(first?.contour || []);\`,
    'full-resolution first paper selection',
  );`,
    after:`  if (!capture.includes('const first = chooseLiveCandidateV1063(found, null) || found[0] || null;')) {
    const firstPattern = /const first = found\\[0\\];\\s*setCandidates\\(found\\);\\s*setSelectedCandidateId\\(first\\?\\.id \\|\\| ''\\);\\s*setAutomaticContour\\(first\\?\\.contour \\|\\| \\[\\]\\);\\s*setContour\\(first\\?\\.contour \\|\\| \\[\\]\\);/;
    if (!firstPattern.test(capture)) throw new Error('v106.3 missing full-resolution first paper selection');
    capture = capture.replace(firstPattern, \`const first = chooseLiveCandidateV1063(found, null) || found[0] || null;
        setCandidates(found);
        setSelectedCandidateId(first?.id || '');
        setAutomaticContour(first?.contour || []);
        setContour(first?.contour || []);\`);
  }`,
    label:'first selection',
  },
  {
    before:`  capture = replaceOnce(
    capture,
    \`  function selectCandidate(candidate) {
    setSelectedCandidateId(candidate.id);
    setAutomaticContour(candidate.contour || []);
    setContour(candidate.contour || []);\`,
    \`  function selectCandidate(candidate) {
    const normalizedCandidate = normalizeLiveCandidateV1063(candidate);
    setSelectedCandidateId(candidate.id);
    setAutomaticContour(normalizedCandidate?.contour || []);
    setContour(normalizedCandidate?.contour || []);\`,
    'manual candidate boundary normalization',
  );`,
    after:`  if (!capture.includes('const normalizedCandidate = normalizeLiveCandidateV1063(candidate);')) {
    const selectPattern = /function selectCandidate\\(candidate\\) \\{\\s*setSelectedCandidateId\\(candidate\\.id\\);\\s*setAutomaticContour\\(candidate\\.contour \\|\\| \\[\\]\\);\\s*setContour\\(candidate\\.contour \\|\\| \\[\\]\\);/;
    if (!selectPattern.test(capture)) throw new Error('v106.3 missing manual candidate boundary normalization');
    capture = capture.replace(selectPattern, \`function selectCandidate(candidate) {
    const normalizedCandidate = normalizeLiveCandidateV1063(candidate);
    setSelectedCandidateId(candidate.id);
    setAutomaticContour(normalizedCandidate?.contour || []);
    setContour(normalizedCandidate?.contour || []);\`);
  }`,
    label:'select candidate',
  },
  {
    before:`  capture = replaceOnce(
    capture,
    \`  const frameFound = Boolean(liveCandidate && contourAreaV106(liveCandidate.contour) >= .12);\`,
    \`  const frameFound = Boolean(liveCandidate && normalizeContourV106(liveCandidate.contour).length === 4 && contourAreaV106(liveCandidate.contour) >= .12);\`,
    'four-corner live frame requirement',
  );`,
    after:`  if (!capture.includes('normalizeContourV106(liveCandidate.contour).length === 4')) {
    const framePattern = /const frameFound = Boolean\\(liveCandidate && contourAreaV106\\(liveCandidate\\.contour\\) >= \\.12\\);/;
    if (!framePattern.test(capture)) throw new Error('v106.3 missing four-corner live frame requirement');
    capture = capture.replace(framePattern, 'const frameFound = Boolean(liveCandidate && normalizeContourV106(liveCandidate.contour).length === 4 && contourAreaV106(liveCandidate.contour) >= .12);');
  }`,
    label:'frame requirement',
  },
];

for (const replacement of replacements) {
  if (source.includes(replacement.after)) continue;
  if (!source.includes(replacement.before)) throw new Error(`v106.3 prepatch target missing: ${replacement.label}`);
  source = source.replace(replacement.before, replacement.after);
}
fs.writeFileSync(target, source);
console.log('v106.3 materializer regex prepatch applied');
