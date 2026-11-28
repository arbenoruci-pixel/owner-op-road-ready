// The exported PDF is the attachment. Keep the larger reviewed page images
// for on-device OCR while the form still holds that particular File.
const receiptPhotos = new WeakMap();
export function rememberReceiptPhotos(file, photos) { receiptPhotos.set(file, photos); }
export function getReceiptPhotos(file) { return receiptPhotos.get(file); }

// Only the selected page and its original capture are held by the local form.
const sources = new WeakMap();
export function rememberReceiptPhotoSource(preview, source) { sources.set(preview, source); }
export function getReceiptPhotoSource(preview) { return sources.get(preview); }
