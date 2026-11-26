const directLimit = 4 * 1024 * 1024;
const limit = 32 * 1024 * 1024;
const chunkSize = 512 * 1024;
const mimeByExtension = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  csv: 'text/csv', txt: 'text/plain',
};

function readBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(new Error('Could not read this file. Select the original file again.'));
    reader.onabort = () => reject(new Error('File reading was interrupted. Select the original file again.'));
    reader.readAsDataURL(blob);
  });
}

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareOriginal(file) {
  const extension = file.name.split('.').at(-1).toLowerCase();
  const mime = Object.hasOwn(mimeByExtension, extension) && mimeByExtension[extension];
  if (!mime || file.name.length > 255 || file.size < 1 || file.size > limit) {
    throw new Error('Choose a PDF, JPG, PNG, CSV or TXT file between 1 byte and 32 MiB.');
  }
  if (file.size <= directLimit) return { name: file.name, mime, base64: await readBase64(file) };
  // Web Crypto verifies the whole original. Only a single transport chunk is encoded at a time.
  return { name: file.name, mime, file, digest: await sha256(await file.arrayBuffer()) };
}

function checkedData(result) {
  if (result.error?.code === '23505' && result.error.message?.startsWith('This original already has a recorded amount.')) {
    throw new Error('This receipt already has a recorded cost. Leave the amount blank when adding its fuel or maintenance details.');
  }
  if (result.error?.code === '23505') throw new Error('This original was already used with different details. Check the saved entry before adding it again.');
  if (result.error?.code === '42501') throw new Error('Access to this workspace could not be verified. Sign in again.');
  if (['22023', '22021', '23514'].includes(result.error?.code)) {
    throw new Error('Check the dates, amounts and original file format. CSV and TXT originals need UTF-8 text.');
  }
  if (result.error || result.data == null) throw new Error('Could not confirm this save. Check your connection and retry the same entry.');
  return result.data;
}

export async function saveDriverRecord(client, operatorId, requestId, record, original, onProgress, isActive) {
  const fields = { p_operator_id: operatorId, p_request_id: requestId, p_record: record };
  function checkActive() {
    if (!isActive()) throw new Error('Upload paused. Return to this workspace to resume.');
  }
  checkActive();
  if (!original?.file) {
    return checkedData(await client.rpc('rr_driver_save_record', { ...fields, p_file_base64: original?.base64 ?? null }));
  }

  // A retry repeats the same begin, chunk index or finish request, including after a lost response.
  async function send(name, args) {
    checkActive();
    let reply;
    try {
      reply = await client.rpc(name, args);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    if (!reply || reply.status === 0 || reply.status === 408 || (reply.status >= 500 && reply.status < 600)) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      checkActive();
      reply = await client.rpc(name, args);
    }
    return checkedData(reply);
  }

  const { file, digest } = original;
  const total = Math.ceil(file.size / chunkSize);
  const session = await send('rr_driver_upload_begin', { ...fields, p_byte_size: file.size, p_sha256: digest });
  if (session.record_id) return session.record_id;
  if (!session.upload_id || !Array.isArray(session.received) ||
      session.received.some((index) => !Number.isInteger(index) || index < 0 || index >= total)) {
    throw new Error('Could not verify upload progress. Retry the same entry.');
  }
  const received = new Set(session.received);
  onProgress({ done: received.size, total });
  for (let index = 0; index < total; index++) {
    if (received.has(index)) continue;
    checkActive();
    const start = index * chunkSize;
    const encoded = await readBase64(file.slice(start, Math.min(start + chunkSize, file.size)));
    const accepted = await send('rr_driver_upload_chunk', { p_upload_id: session.upload_id, p_index: index, p_base64: encoded });
    if (accepted !== index) throw new Error('Could not verify this part of the upload. Retry the same entry.');
    received.add(index);
    onProgress({ done: received.size, total });
  }
  return send('rr_driver_finish_upload', { p_upload_id: session.upload_id });
}
