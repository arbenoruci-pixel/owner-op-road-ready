import React from 'react';
import SmartImportPanel from '../smart-import/SmartImportPanel.jsx';
import ImportLibraryPanel from '../owneros/ImportLibraryPanelV110434.jsx';
import RecoveryPanel from '../owneros/RecoveryPanelV110413.jsx';
import LibraryHistory from '../owneros/LibraryHistoryV110434.jsx';

export default function ImportDocumentsScreen({state, onBack, onBackup, onScan, onMonth}) {
  return <section className="phone-import-screen"><header><button type="button" onClick={onBack}>‹ Home</button><h1>Import</h1><button type="button" onClick={onMonth}>My month</button></header><SmartImportPanel state={state} onScan={onScan}/><details className="phone-import-help"><summary>Road Ready packages & recovery</summary><ImportLibraryPanel/><section><h2>Reviewed document details</h2><p>Apply reviewed recovery details to their source documents.</p><RecoveryPanel/></section><LibraryHistory/></details><div className="phone-import-help"><h2>Moving to this device?</h2><p>Use Export Everything to bring back your driver, active logbook and settings from a device backup.</p><button type="button" onClick={onBackup}>Open backup & restore</button></div></section>;
}
