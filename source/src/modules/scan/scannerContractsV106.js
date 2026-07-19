export const ROAD_READY_SCANNER_VERSION_V106 = '106.0.0';
export const ROAD_READY_SCANNER_CONTRACT_V106 = 'road-ready-scanner-adapter-v106';

export const PAGE_QUALITY_V106 = Object.freeze({
  excellent:'excellent',
  usable:'usable',
  recapture:'recapture',
});

export const CAPTURE_SOURCE_V106 = Object.freeze({
  native:'native-document-scanner',
  camera:'road-ready-camera',
  gallery:'gallery-import',
  file:'file-import',
});

export function clamp01V106(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function roundV106(value, precision = 6) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function normalizePointV106(point = {}) {
  return {
    x:clamp01V106(point.x),
    y:clamp01V106(point.y),
  };
}

export function normalizeContourV106(contour = []) {
  const points = (Array.isArray(contour) ? contour : [])
    .map(normalizePointV106)
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length >= 4) return points;
  return [
    { x:.04, y:.04 },
    { x:.96, y:.04 },
    { x:.96, y:.96 },
    { x:.04, y:.96 },
  ];
}

export function contourAreaV106(contour = []) {
  const points = normalizeContourV106(contour);
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += (current.x * next.y) - (next.x * current.y);
  }
  return Math.abs(sum) / 2;
}

export function contourBoundsV106(contour = []) {
  const points = normalizeContourV106(contour);
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    right,
    bottom,
    width:Math.max(0, right - left),
    height:Math.max(0, bottom - top),
    area:Math.max(0, (right - left) * (bottom - top)),
  };
}

export function contourCenterV106(contour = []) {
  const points = normalizeContourV106(contour);
  return {
    x:points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y:points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function stableValueV106(value) {
  if (Array.isArray(value)) return value.map(stableValueV106);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValueV106(value[key]);
      return result;
    }, {});
  }
  if (typeof value === 'number') return roundV106(value);
  return value;
}

export function stableStringifyV106(value) {
  return JSON.stringify(stableValueV106(value));
}

export function stableHashV106(value = '') {
  const input = typeof value === 'string' ? value : stableStringifyV106(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function fileHashV106(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return `meta_${stableHashV106({
      name:file?.name || '',
      size:file?.size || 0,
      type:file?.type || '',
      lastModified:file?.lastModified || 0,
    })}`;
  }
  try {
    const bytes = await file.arrayBuffer();
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    const view = new Uint8Array(bytes);
    let hash = 0x811c9dc5;
    for (let index = 0; index < view.length; index += 1) {
      hash ^= view[index];
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  } catch {
    return `meta_${stableHashV106({
      name:file?.name || '',
      size:file?.size || 0,
      type:file?.type || '',
      lastModified:file?.lastModified || 0,
    })}`;
  }
}

export function candidateFingerprintV106(candidate = {}) {
  return stableHashV106({
    source:candidate.source || '',
    contour:normalizeContourV106(candidate.contour).map(point => ({
      x:roundV106(point.x, 4),
      y:roundV106(point.y, 4),
    })),
    geometryMode:candidate.geometryMode || 'planar',
  });
}

export function stableSortCandidatesV106(candidates = []) {
  return [...(Array.isArray(candidates) ? candidates : [])]
    .map(candidate => ({
      ...candidate,
      id:candidate.id || `candidate_${candidateFingerprintV106(candidate)}`,
      score:clamp01V106(candidate.score),
    }))
    .sort((left, right) => {
      const score = right.score - left.score;
      if (Math.abs(score) > 1e-9) return score;
      const area = contourAreaV106(right.contour) - contourAreaV106(left.contour);
      if (Math.abs(area) > 1e-9) return area;
      return String(left.id).localeCompare(String(right.id));
    });
}

export function candidateSelectionV106(candidates = []) {
  const ordered = stableSortCandidatesV106(candidates);
  const first = ordered[0] || null;
  const second = ordered[1] || null;
  const uncertain = Boolean(
    !first
    || first.score < .68
    || second && Math.abs(first.score - second.score) < .09
  );
  return {
    selected:first,
    candidates:uncertain ? ordered.slice(0, 3) : ordered.slice(0, Math.min(3, ordered.length)),
    uncertain,
  };
}

function normalizedQualityMetricsV106(metrics = {}) {
  return {
    documentCoverage:clamp01V106(metrics.documentCoverage),
    edgeCompleteness:clamp01V106(metrics.edgeCompleteness),
    blurScore:clamp01V106(metrics.blurScore),
    glareScore:clamp01V106(metrics.glareScore),
    shadowScore:clamp01V106(metrics.shadowScore),
    perspectiveSeverity:clamp01V106(metrics.perspectiveSeverity),
    curvatureScore:clamp01V106(metrics.curvatureScore),
    textPixelHeight:Math.max(0, Number(metrics.textPixelHeight || 0)),
    clippingRisk:clamp01V106(metrics.clippingRisk),
    resolutionScore:clamp01V106(metrics.resolutionScore),
  };
}

export function createPageQualityReportV106(metrics = {}) {
  const value = normalizedQualityMetricsV106(metrics);
  const reasons = [];
  if (value.documentCoverage < .34 || value.textPixelHeight && value.textPixelHeight < 10) {
    reasons.push('Move closer — text is too small');
  }
  if (value.blurScore < .42) reasons.push('Hold still — image is blurred');
  if (value.glareScore > .14) reasons.push('Tilt the phone — glare covers part of the document');
  if (value.shadowScore > .62) reasons.push('Change the angle — a deep shadow covers the page');
  if (value.clippingRisk > .34 || value.edgeCompleteness < .64) reasons.push('Include all four page edges');
  if (value.resolutionScore < .38) reasons.push('Use a higher-resolution photo');
  if (value.perspectiveSeverity > .82) reasons.push('Move above the page — the viewing angle is too steep');

  const severe = [
    value.blurScore < .24,
    value.glareScore > .29,
    value.clippingRisk > .7,
    value.edgeCompleteness < .4,
    value.resolutionScore < .22,
  ].filter(Boolean).length;

  let quality = PAGE_QUALITY_V106.usable;
  if (severe || reasons.length >= 3) quality = PAGE_QUALITY_V106.recapture;
  else if (!reasons.length
    && value.documentCoverage >= .55
    && value.edgeCompleteness >= .82
    && value.blurScore >= .68
    && value.glareScore <= .07
    && value.shadowScore <= .32
    && value.resolutionScore >= .72) {
    quality = PAGE_QUALITY_V106.excellent;
  }

  return {
    ...value,
    quality,
    reasons:[...new Set(reasons)],
  };
}

export function createVersionRecordV106(kind, file, metadata = {}) {
  return Object.freeze({
    kind,
    file:file || null,
    immutable:kind === 'original',
    createdAt:metadata.createdAt || new Date().toISOString(),
    geometryMode:metadata.geometryMode || '',
    filter:metadata.filter || '',
    hash:metadata.hash || '',
    width:Number(metadata.width || 0),
    height:Number(metadata.height || 0),
  });
}

export function createScannedPacketV106(input = {}) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const createdAt = input.createdAt || new Date().toISOString();
  const computedOriginalPreserved = pages.every(page => Boolean(page?.versions?.original?.file));
  const manifest = {
    contract:ROAD_READY_SCANNER_CONTRACT_V106,
    scannerVersion:ROAD_READY_SCANNER_VERSION_V106,
    source:input.source || CAPTURE_SOURCE_V106.file,
    createdAt,
    pageCount:pages.length,
    originalPreserved:typeof input.originalPreserved === 'boolean' ? input.originalPreserved : computedOriginalPreserved,
    imageHashes:pages.map(page => page?.versions?.original?.hash || '').filter(Boolean),
    geometryModes:pages.map(page => page?.geometryMode || 'planar'),
    quality:pages.map(page => page?.quality?.quality || PAGE_QUALITY_V106.usable),
    deterministic:true,
    classificationTouched:false,
  };
  return Object.freeze({
    contract:ROAD_READY_SCANNER_CONTRACT_V106,
    scannerVersion:ROAD_READY_SCANNER_VERSION_V106,
    source:manifest.source,
    createdAt,
    pages,
    manifest:Object.freeze(manifest),
    trace:input.trace || {},
  });
}

export function assertScannerAdapterV106(adapter) {
  const methods = [
    'captureDocument',
    'importImages',
    'detectDocumentRegions',
    'rectifyCandidate',
    'assessQuality',
  ];
  for (const method of methods) {
    if (typeof adapter?.[method] !== 'function') throw new Error(`scanner_adapter_missing:${method}`);
  }
  return adapter;
}

export function serializablePacketManifestV106(packet = {}) {
  return {
    ...(packet.manifest || {}),
    pages:(packet.pages || []).map((page, index) => ({
      index,
      candidateId:page.candidate?.id || '',
      candidateScore:Number(page.candidate?.score || 0),
      geometryMode:page.geometryMode || '',
      deskewAngle:Number(page.deskewAngle || 0),
      quality:page.quality || null,
      variants:Object.keys(page.versions || {}),
    })),
  };
}
