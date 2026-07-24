export const SCANNER_CORE_VERSION = '1.0.0';

/**
 * Scanner Core owns image cleanup only. It never classifies, reads, stores,
 * links, or mutates Logbook data.
 */
export async function processScannedDocument({ originalFile, processor, options = {} }) {
  if (!originalFile) throw new Error('originalFile is required');
  if (typeof processor !== 'function') throw new Error('scanner processor is required');

  const result = await processor({ originalFile, options });
  if (!result?.normalizedFile) throw new Error('scanner did not return normalizedFile');

  return Object.freeze({
    originalFile,
    normalizedFile: result.normalizedFile,
    previewFile: result.previewFile || result.normalizedFile,
    scannerVersion: SCANNER_CORE_VERSION,
    warnings: Object.freeze([...(result.warnings || [])]),
  });
}
