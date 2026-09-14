import fs from 'node:fs';
import assert from 'node:assert/strict';

function patch(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, `Saved document access anchor: ${path}`);
  fs.writeFileSync(path, source.replace(before, after));
}
for (const file of ['SavedDocumentFilesV110344.jsx', 'savedDocumentFilesV110344.css']) {
  fs.copyFileSync(`scripts/v110344/${file}`, `source/src/modules/owneros/${file}`);
}
const folders = 'source/src/modules/owneros/LoadFoldersV10969.jsx';
patch(folders, "import './loadFolderReviewV10974.css';", "import './loadFolderReviewV10974.css';\nimport SavedDocumentFilesV110344 from './SavedDocumentFilesV110344.jsx';");
patch(folders,
  ` return <><div className="owner-os-section-head-v102"><div><span>DOCUMENTS · v{VERSION}</span><b>{openWeek?'LOADS OF SELECTED WEEK':'WEEKLY LOAD FOLDERS'}</b></div><div className="load-folder-head-actions-v10973"><RepairImportPanelV10975 onApplied={()=>setRevision(v=>v+1)}/><FuelEvidenceRepairV1103 onApplied={()=>setRevision(v=>v+1)}/><button type="button" disabled={auditBusy} onClick={exportAudit}>{auditBusy?'Exporting…':'Audit Export'}</button><button type="button" onClick={onScan}>+ Add</button></div></div>`,
  ` return <section className="documents-home-v344"><header className="documents-heading-v344"><div><h2>My documents</h2><p>Saved scans and load folders</p></div><button type="button" onClick={onScan}>Add scan</button></header>
 {!openWeek?<SavedDocumentFilesV110344 documents={documents} loading={loading}/>:null}
 <details className="documents-organize-v344"><summary>Organize &amp; export</summary><div className="load-folder-head-actions-v10973"><RepairImportPanelV10975 onApplied={()=>setRevision(v=>v+1)}/><FuelEvidenceRepairV1103 onApplied={()=>setRevision(v=>v+1)}/><button type="button" disabled={auditBusy} onClick={exportAudit}>{auditBusy?'Exporting…':'Audit Export'}</button></div>`);
patch(folders,
  '<div className="load-folder-audit-message-v10973">Live archive · Current Logbooks and mileage follow saved event edits. Exported files keep their generation date.</div>',
  '<div className="load-folder-audit-message-v10973">Current Logbooks and mileage follow saved event edits. Exported files keep their generation date.</div></details>');
patch(folders, "{showReview?'Close wizard':'Open wizard'}", "{showReview?'Close review':'Review details'}");
patch(folders, " {!openWeek?<>{loading?", " <h2 className=\"documents-weeks-heading-v344\">{openWeek?'Loads in this week':'Weekly load folders'}</h2>\n {!openWeek?<>{loading?");
patch(folders, '\n </>;\n}', '\n </section>;\n}');

const scan = 'source/src/modules/scan/SmartScanSheetV105.jsx';
patch(scan, "import React,", "import {SavedFileActionsV110344} from '../owneros/SavedDocumentFilesV110344.jsx';\nimport React,");
patch(scan, '      setSaved(savedViewV10964);', `      savedViewV10964.fileDocument = {
        client_document_id:stored.localDocument?.client_document_id || '',
        original_file_name:stored.localDocument?.original_file_name || record.fileName || '',
        mime_type:stored.localDocument?.mime_type || '',
      };
      setSaved(savedViewV10964);`);
patch(scan, '        <h1>{saved.meta.label}</h1>', `        <h1>{saved.meta.label}</h1>
        <section className="scan-saved-location-v344"><h2>Saved in Road Ready</h2><p>Find this file in <strong>Documents → Recent documents</strong>.</p><p>{saved.record.fileName}</p><SavedFileActionsV110344 document={saved.fileDocument}/></section>`);
patch(scan, "'Safe on this device'", "'Saved in this app on this device'");

const VERSION='110.3.44', BUILD='v110344-saved-document-access';
for(const path of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.44 Find and share saved documents',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Find recent scans before reviewing their details.','Open, share or download the original from the saved screen.','Keep document review controls within the phone screen.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']) {
  const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let source=fs.readFileSync(path,'utf8');
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs', "assert.equal(meta.version,'110.3.43');assert.equal(meta.build,'v110343-missing-reference-reader');", `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — v110.3.44 saved-file access and phone document layout installed');
