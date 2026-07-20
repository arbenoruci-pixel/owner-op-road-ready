import { normalizeContourV106 } from './scannerContractsV106.js';

export const RECTIFICATION_POLICY_VERSION_V1068 = '106.8.0';

export function rectificationPolicyV1068(candidate = {}, forcedGeometry = 'auto') {
  const contour = normalizeContourV106(candidate.contour || []);
  const pointCount = contour.length;
  const curvature = Math.max(0, Number(candidate.metrics?.curvatureScore || 0));
  const source = String(candidate.source || '');
  const angleRefined = Boolean(candidate.metrics?.angleRefinedV1067)
    || source.includes('angle-refined-v1067');
  const fourCornerPage = pointCount === 4;
  const explicitMesh = forcedGeometry === 'mesh';
  const strongCurvature = pointCount >= 6 && curvature >= .18;

  if (forcedGeometry === 'planar' || fourCornerPage || angleRefined) {
    return {
      geometryMode:'planar',
      useMesh:false,
      pointCount,
      curvature,
      reason:angleRefined ? 'angle-refined-four-corner-page' : fourCornerPage ? 'four-corner-page' : 'driver-straighten',
    };
  }

  if (explicitMesh && strongCurvature) {
    return {
      geometryMode:'mesh',
      useMesh:true,
      pointCount,
      curvature,
      reason:'driver-flatten-with-curvature-evidence',
    };
  }

  if (forcedGeometry === 'auto' && candidate.geometryMode === 'mesh' && pointCount >= 8 && curvature >= .24) {
    return {
      geometryMode:'mesh',
      useMesh:true,
      pointCount,
      curvature,
      reason:'high-confidence-curved-page',
    };
  }

  return {
    geometryMode:'planar',
    useMesh:false,
    pointCount,
    curvature,
    reason:explicitMesh ? 'flatten-rejected-insufficient-control-points' : 'safe-planar-default',
  };
}
