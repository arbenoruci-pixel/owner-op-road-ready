// Keep the exact reviewed bytes if the server stores them but the response is lost.
// Edits, retakes, and reordering replace the pages array and produce a new PDF.
export async function uploadReviewedPod(cache, pages, prepare, send) {
  if (cache.current?.pages !== pages) {
    cache.current = {pages, file:await prepare()};
  }
  return send(cache.current.file);
}

// An expired reservation has no stored original. For all other failures keep
// the same ID, so a retry can recover a receipt even if its response was lost.
export async function sendReservedPod(reservation, send) {
  try {
    return await send(reservation.id);
  } catch (error) {
    if (error.message !== 'pod_upload_expired') throw error;
    reservation.id = crypto.randomUUID();
    return send(reservation.id);
  }
}

const uploadMessages = {
  pod_load_needs_review: 'Dispatch needs to check the load before this POD can be attached. Your file is still selected.',
  pod_save_failed: 'Your PDF or photo could not be saved. The file is still selected. Try again.',
  pod_load_closed: 'This load is closed to new POD uploads. Ask dispatch how to submit a correction.',
  pod_load_unsupported: 'This load does not accept driver POD uploads. Check the selected load.',
  pod_original_filed: 'This original is already on file. Ask dispatch to check where it was filed.',
  pod_original_rejected: 'This exact original was rejected. Upload a corrected document.',
  invalid_request: 'The POD could not be attached. Check the selected file and load details.',
  choose_load_or_orphan: 'Select a load or enter both the broker and load number.',
  invalid_file_metadata: 'Choose an original PDF, JPEG, PNG or WebP file up to 3 MiB.',
  unsupported_document_type: 'Choose an original PDF, JPEG, PNG or WebP file.',
  pod_upload_limit: 'The upload limit has been reached. Keep this file selected and try again later.',
  pod_upload_expired: 'The upload timed out. Tap Upload POD to try again with the selected file.',
  conflicting_request: 'This upload conflicts with a previously submitted file. Check the original and select it again.',
  access_denied: 'This account cannot attach a POD to this load. Check the assignment with dispatch.',
  authentication_required: 'Your session expired. Sign in again to upload the POD.',
  payload_too_large: 'Choose a PDF or photo up to 3 MiB.',
  mime_signature_mismatch: 'The file contents do not match its format. Choose the original PDF or photo.',
  operator_request_failed: 'RoadReady could not confirm the upload. Try again with the selected file.',
};

export function podUploadMessage(error) {
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return 'Connection lost. Tap Upload POD to retry with the same document.';
  }
  const code = error?.message === 'Sign in again' ? 'authentication_required' : error?.message;
  return Object.hasOwn(uploadMessages, code) ? uploadMessages[code] : uploadMessages.operator_request_failed;
}


export function confirmedPodMessage(result, assignedLoadId) {
  if (!result?.documentId || !result.loadId || (assignedLoadId && result.loadId !== assignedLoadId)) {
    throw Error('operator_request_failed');
  }
  switch (result.review_status) {
    case 'REJECTED': throw Error('pod_original_rejected');
    case 'ALREADY_FILED': return 'POD already filed';
    case 'CORRECTION_REVIEW': return 'Additional document received';
    default: return 'POD received';
  }
}
