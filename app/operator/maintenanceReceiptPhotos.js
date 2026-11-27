// The exported PDF is the attachment. Keep the larger reviewed page images
// for on-device OCR while the form still holds that particular File.
const receiptPhotos = new WeakMap();
export function rememberReceiptPhotos(file, photos) { receiptPhotos.set(file, photos); }
export function getReceiptPhotos(file) { return receiptPhotos.get(file); }
