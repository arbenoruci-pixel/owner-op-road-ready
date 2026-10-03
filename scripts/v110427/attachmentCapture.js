// The page intake supplies image preparation, not document interpretation.
// Do not persist the React draft, decoded pixel buffers, or reader fields.
export function attachmentCaptureMetadata(meta = {}) {
  const captureAssets = (Array.isArray(meta.captureAssets) ? meta.captureAssets : []).filter(asset => asset && asset.file);
  return {
    source:'load-attachment-scanner',
    scannerVersion:'110.4.27',
    pageCount:Math.max(1, Number(meta.pageCount) || 1),
    originalFileName:String(meta.originalFileName || ''),
    ...(meta.captureManifest ? {captureManifest:meta.captureManifest} : {}),
    ...(meta.documentQualityV11036 ? {documentQualityV11036:meta.documentQualityV11036} : {}),
    captureAssets,
  };
}
