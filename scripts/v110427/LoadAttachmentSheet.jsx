'use client';
import React, {useRef, useState} from 'react';
import AttachmentIntake from './AttachmentIntakeV110427.jsx';
import {localDateKey, readBusinessStore, writeBusinessStore} from '../business/businessStore.js';
import {buildVaultDocumentV105, upsertVaultDocumentV105} from '../documents/documentFoundationV105.js';
import {saveScannedDocumentQuotaSafeV10963} from './quotaSafeScanStorageV10963.js';
import {saveLoadAttachment} from './attachmentContextV110426.js';
import {attachmentCaptureMetadata} from './attachmentCaptureV110427.js';

// Capture identity once. Another device or a background refresh must not move
// these pages to a different load while the driver is editing them.
export default function LoadAttachmentSheet({state, context, onClose}) {
  const [target] = useState(() => ({...context, stop:context.stop ? {...context.stop} : null}));
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  const label = target.type.toUpperCase();
  async function save(file, ignoredType, scanMeta = {}) {
    if (saving.current) throw new Error('Please wait for this document to finish saving.');
    saving.current = true;
    try {
      const capture = attachmentCaptureMetadata(scanMeta);
      await saveLoadAttachment({file, context:target, date:localDateKey(), state,
        storage:args => saveScannedDocumentQuotaSafeV10963({...args,
          metadata:{...args.metadata, ...capture},
          captureAssets:capture.captureAssets,
          scanMeta:capture,
        }),
        buildRecord:buildVaultDocumentV105, upsertRecord:upsertVaultDocumentV105,
        readStore:readBusinessStore, writeStore:writeBusinessStore,
      });
      window.__ROAD_READY_PENDING_DOCUMENT_REFRESH_V10972__ = {type:target.type, loadNo:target.loadNo, savedAt:Date.now()};
      setSaved(true);
    } catch (cause) {
      // The intake awaits this promise and retains every selected page on error.
      throw new Error('Could not save. Your pages are still here. Please try Save again.', {cause});
    } finally {saving.current = false;}
  }
  return <div className="attachment-ios-v427" data-document-type={target.type}>
    {saved ? <section className="attachment-saved-v427" aria-label="Document saved">
      <div className="attachment-check-v427" aria-hidden="true">✓</div>
      <h1>{label} saved</h1>
      <p>Load {target.loadNo}</p>
      <p>Your document is filed with this load.</p>
      <button type="button" autoFocus onClick={onClose}>Done</button>
    </section> : <AttachmentIntake documentLabel={label} loadNo={target.loadNo} onReady={save} onClose={onClose}/>}
  </div>;
}
