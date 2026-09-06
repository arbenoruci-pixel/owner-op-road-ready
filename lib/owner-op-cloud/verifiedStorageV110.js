// One binary transport for browser/PWA uploads; verify bytes before DB commit.
export async function uploadVerified(storage, path, blob, mime, expectedSha, hash) {
  if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('Original local document bytes are unavailable');
  const bytes = await blob.arrayBuffer();
  if (!bytes.byteLength) throw new Error('Original document is empty; local record kept');
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('Document exceeds 25 MB; local original kept');
  if (await hash(bytes) !== expectedSha) throw new Error('Local document changed before upload');
  // Raw bytes avoid multipart/Blob body handling differences in iOS.
  const uploaded = await storage.upload(path, bytes, { upsert:false, contentType:mime, cacheControl:'0' });
  if (uploaded.error && !/already exists|duplicate|resource exists/i.test(String(uploaded.error.message || uploaded.error))) throw uploaded.error;
  const downloaded = await storage.download(path);
  if (downloaded.error) throw downloaded.error;
  if (!downloaded.data || typeof downloaded.data.arrayBuffer !== 'function') throw new Error('Cloud verification did not return document bytes');
  const stored = await downloaded.data.arrayBuffer();
  if (stored.byteLength !== bytes.byteLength || await hash(stored) !== expectedSha) throw new Error('Cloud document integrity mismatch; local original kept');
  return { sizeBytes:bytes.byteLength, sha256:expectedSha };
}
