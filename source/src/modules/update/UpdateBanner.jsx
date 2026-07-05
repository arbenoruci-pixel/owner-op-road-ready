import React from 'react';
import { CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';

export default function UpdateBanner({ updateState, onApply, onDismiss }) {
  if (!updateState?.available && updateState?.saveState !== 'saving-update') return null;
  const busy = updateState?.saveState === 'saving-update';
  const latest = updateState?.remote?.version || updateState?.latestVersion || '';
  return (
    <div className="update-safe-banner" role="status" aria-live="polite">
      <div className="update-safe-copy">
        <b>{busy ? 'Saving before update' : 'Update ready'}</b>
        <span>{busy ? 'Logs are being saved on this phone first.' : `v${latest || 'new'} available · current v${CURRENT_APP_VERSION}`}</span>
      </div>
      <div className="update-safe-actions">
        <button type="button" className="update-safe-primary" onClick={onApply} disabled={busy}>{busy ? 'Saving…' : 'Update safely'}</button>
        {!busy ? <button type="button" className="update-safe-secondary" onClick={onDismiss}>Later</button> : null}
      </div>
    </div>
  );
}
