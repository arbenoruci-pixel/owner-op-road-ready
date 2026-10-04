import React from 'react';
import ImportLibraryPanel from '../owneros/ImportLibraryPanelV110434.jsx';
import LibraryHistory from '../owneros/LibraryHistoryV110434.jsx';

export default function ImportDocumentsScreen({onBack,onBackup}) {
 return <section className="phone-import-screen"><header><button type="button" onClick={onBack}>‹ Home</button><h1>Import</h1></header><ImportLibraryPanel/><div className="phone-import-help"><h2>Moving to this device?</h2><p>A documents ZIP adds load folders and saved logbook copies. To bring back your driver, active logs and settings, restore an Export Everything backup.</p><button type="button" onClick={onBackup}>Open backup & restore</button></div><LibraryHistory/></section>;
}
