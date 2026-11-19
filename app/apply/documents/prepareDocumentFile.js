const MiB = 1024 * 1024;
const uploadLimit = 3 * MiB;
const photoLimit = 24 * MiB;
const allowedOriginals = ['application/pdf', 'image/jpeg', 'image/png'];
const phonePhotos = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];

export function typeOfFile(file) {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split('.').pop().toLowerCase();
  return { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif' }[extension] || '';
}

export async function prepareDocumentFile(file) {
  const type = typeOfFile(file);
  if (!file.size) throw new Error('The file is empty. Choose another copy.');
  if (type === 'application/pdf' && file.size > uploadLimit) throw new Error('Choose a PDF of 3 MB or less, or ask Narta Express for help sending the original document.');
  if (allowedOriginals.includes(type) && file.size <= uploadLimit) return { file, converted: false };
  if (!['image/jpeg', 'image/png', ...phonePhotos].includes(type)) throw new Error('Choose a JPG, PNG or PDF. Supported iPhone photos can also be converted on this device.');
  if (file.size > photoLimit) throw new Error('This photo is over 24 MB. Export a smaller JPG from your photo library and choose it again.');
  if (type.endsWith('-sequence')) throw new Error('Export one clear JPG for the requested page, then choose it again.');

  const source = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    // The browser applies the photo’s embedded orientation. Draw the entire frame without cropping.
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('This browser could not read that photo. Export it as a JPG or choose a PDF of 3 MB or less.'));
      image.src = source;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > 64000000) throw new Error('Export the photo at a smaller resolution, then choose it again.');
    for (const [longEdge, quality] of [[2800, .9], [2400, .84], [2100, .8]]) {
      const scale = Math.min(1, longEdge / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) break;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob?.type === 'image/jpeg' && blob.size && blob.size <= uploadLimit) {
        return { file: new File([blob], 'document-photo.jpg', { type: 'image/jpeg' }), converted: true };
      }
    }
    throw new Error('This photo could not be prepared within 3 MB. Export a smaller JPG or choose a PDF of 3 MB or less.');
  } finally {
    URL.revokeObjectURL(source);
    canvas.width = canvas.height = 0;
  }
}
