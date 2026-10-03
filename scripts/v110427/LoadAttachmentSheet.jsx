'use client';
import React, {useRef, useState} from 'react';
import AttachmentIntake from './AttachmentIntakeV110427.jsx';
import {localDateKey, readBusinessStore, writeBusinessStore} from '../business/businessStore.js';
import {buildVaultDocumentV105, upsertVaultDocumentV105} from '../documents/documentFoundationV105.js';
import {saveScannedDocumentQuotaSafeV10963} from './quotaSafeScanStorageV10963.js';
import {persistCaptureAssetsV106} from './captureAssetStoreV106.js';
import {saveLoadAttachment} from './attachmentContextV110426.js';
import {attachmentCaptureMetadata} from './attachmentCaptureV110427.js';

// Freeze the selected load while the driver adjusts its pages.
export default function LoadAttachmentSheet({state, context, onClose}) {
  const [target] = useState(() => ({...context, stop:context.stop ? {...context.stop} : null}));
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const saving = useRef(false);
  const label = target.type.toUpperCase();
  async function save(file, ignoredType, scanMeta = {}) {
    if (saving.current) throw new Error('Please wait for this document to finish saving.');
    saving.current = true;
    try {
      const {captureAssets, ...capture} = attachmentCaptureMetadata(scanMeta);
      let warning = '';
      await saveLoadAttachment({file, context:target, date:localDateKey(), state,
        storage:async args => {
          const stored = await saveScannedDocumentQuotaSafeV10963({...args, metadata:{...args.metadata, ...capture}});
          warning = stored.warning || '';
          if (captureAssets.length) {
            const evidence = await persistCaptureAssetsV106({
              clientDocumentId:stored.localDocument?.client_document_id || '',
              assets:captureAssets, captureManifest:capture.captureManifest || null,
              scannerVersion:capture.scannerVersion,
            });
            stored.capture = evidence;
            if (evidence.status === 'stored' && stored.localDocument) {
              Object.assign(stored.localDocument, {capture_manifest:capture.captureManifest || null,
                capture_run_id:evidence.runId, capture_assets:evidence.assets, capture_asset_count:evidence.stored});
            } else if (evidence.status !== 'stored') {
              warning = 'The finished document is saved. Some original scan photos could not be kept; keep your paper or camera originals.';
            }
          }
          return stored;
        },
        buildRecord:buildVaultDocumentV105, upsertRecord:upsertVaultDocumentV105,
        readStore:readBusinessStore, writeStore:writeBusinessStore,
      });
      window.__ROAD_READY_PENDING_DOCUMENT_REFRESH_V10972__ = {type:target.type, loadNo:target.loadNo, savedAt:Date.now()};
      setNotice(warning);
      setSaved(true);
    } catch (cause) {
      // Awaiting this promise keeps the selected pages available after a failure.
      throw new Error('Could not finish saving. Your pages are still here. Please try Save again.', {cause});
    } finally {saving.current = false;}
  }
  return <div className="attachment-ios-v427" data-document-type={target.type}>
    {saved ? <section className="attachment-saved-v427" aria-label="Document saved">
      <div className="attachment-check-v427" aria-hidden="true">✓</div>
      <h1>{label} saved</h1>
      <p>Load {target.loadNo}</p>
      <p>Your document is filed with this load.</p>
      {notice ? <p role="status">{notice}</p> : null}
      <button type="button" autoFocus onClick={onClose}>Done</button>
    </section> : <AttachmentIntake documentLabel={label} loadNo={target.loadNo} onReady={save} onClose={onClose}/>}
  </div>;
}
