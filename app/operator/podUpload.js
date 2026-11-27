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
  review_required: 'Dispatch needs to review this load before it can accept this POD.',
  invalid_request: 'The POD could not be attached. Your file is still selected. Check the load with dispatch.',
  pod_upload_limit: 'The upload limit has been reached. Keep this file selected and try again later.',
  pod_upload_expired: 'The upload timed out. Tap Upload POD to try again with the selected file.',
  conflicting_request: 'This document or upload already has a record. Check the load with dispatch.',
  access_denied: 'This account cannot attach a POD to this load. Check the assignment with dispatch.',
  authentication_required: 'Your session expired. Sign in again to upload the POD.',
  payload_too_large: 'Choose a PDF or photo up to 3 MiB.',
  mime_signature_mismatch: 'The file contents do not match its format. Choose the original PDF or photo.',
  operator_request_failed: 'RoadReady could not confirm the upload. Tap Upload POD to retry with the selected file.',
};

export function podUploadMessage(error) {
  return uploadMessages[error?.message] || error?.message || 'Upload failed. Try again.';
}


export function confirmedPodMessage(result, assignedLoadId) {
  if (!result?.documentId || !result.loadId || (assignedLoadId && result.loadId !== assignedLoadId)) {
    throw Error('operator_request_failed');
  }
  switch (result.review_status) {
    case 'REJECTED': throw Error('This exact original was rejected. Upload a corrected document.');
    case 'ALREADY_FILED': return 'POD already filed';
    case 'CORRECTION_REVIEW': return 'Additional document received';
    default: return 'POD received';
  }
}
