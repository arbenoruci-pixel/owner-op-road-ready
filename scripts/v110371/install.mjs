import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after) {
  const source=read(path);
  if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,`Document continuity anchor: ${path}: ${before.slice(0,90)}`);
  fs.writeFileSync(path,source.replace(before,after));
}
const owner='source/src/modules/owneros/';
for(const [from,to] of [['readingState.js','readingStateV110371.js'],['offlineOriginal.js','offlineOriginalV110371.js'],['SavedDocumentReread.jsx','SavedDocumentRereadV110347.jsx']]) {
  fs.copyFileSync('scripts/v110371/'+from,owner+to);
}
fs.mkdirSync('lib/documents',{recursive:true});
fs.copyFileSync('scripts/v110371/documentPull.js','lib/documents/documentPullV110371.js');
const sync='lib/sync/clientSync.js';
patch(sync,"'use client';","'use client';\nimport {upsertPulledDocuments} from '../documents/documentPullV110371.js';");
patch(sync,`    for (const row of changes.documents || []) {
      await db.documents_local.put({
        local_id: row.client_document_id || row.id,
        server_id: row.id,
        client_document_id: row.client_document_id,
        driver_id: row.driver_id,
        type: row.type,
        status: row.status,
        original_file_name: row.original_file_name,
        mime_type: row.mime_type,
        file_size_bytes: row.file_size_bytes,
        storage_path: row.storage_path,
        expires_on: row.expires_on,
        created_at: row.created_at,
        sync_state: 'synced'
      });
    }`, '    await upsertPulledDocuments(db, changes.documents || []);');
const preview='source/src/modules/scan/OwnedReaderPreview.jsx';
patch(preview,"import React,{useEffect,useRef,useState} from 'react';", "import React,{useEffect,useRef,useState} from 'react';\nimport {restoreConfirmedReading} from '../../../../packages/smart-reader-core/src/continuity.js';");
patch(preview,'function ReviewBody({analysis,reviewState,onReviewChange,onReady,signal,onSaveReading})', 'function ReviewBody({analysis,reviewState,onReviewChange,onReady,signal,onSaveReading,previousReadings=[]})');
patch(preview,'const next=reviewState?.result||reviewScanAnalysis(analysis,{documentId,dimensions,originalSources});', 'const next=reviewState?.result||previousReadings.reduce((value,previous)=>restoreConfirmedReading(value,previous),reviewScanAnalysis(analysis,{documentId,dimensions,originalSources}));');
patch(preview,'    <p>Check uncertain readings against the page.', `    {result.restoredConfirmationCount?<p role="status">{result.restoredConfirmationCount} saved confirmations kept. Review a saved value to change it.</p>:null}
    {result.continuityWarning?<p role="alert">{result.continuityWarning}</p>:null}
    <p>Check uncertain readings against the page.`);
patch(preview,'        {field.correction?<p>{field.correction.value}</p>:null}', `        {field.correction?<p>{field.correction.value}</p>:null}
        {field.retainedConfirmation?<div className="reader-retained-v371"><span>Saved confirmation kept</span><button type="button" aria-label={\`Review saved \${field.label}\`} onClick={()=>openItem({groupId:group.id,key})}>Review saved value</button><small>Readings below are source suggestions. Your saved value stays until you confirm a change.</small></div>:null}`);
patch(preview,'onClick={()=>confirm(true)}>Next →</button>', 'onClick={()=>confirm(true)}>Confirm &amp; Next →</button>');
patch(preview,"      update(next);setError('');setRereadText('');", "      if(selection.key)delete next.documents.find(group=>group.id===selection.groupId).fields[selection.key].retainedConfirmation;\n      update(next);setError('');setRereadText('');");
patch(preview,'defaultExpanded=false,onSaveReading})', 'defaultExpanded=false,onSaveReading,previousReadings=[]})');
patch(preview,'signal={signal} onSaveReading={onSaveReading}/>', 'signal={signal} onSaveReading={onSaveReading} previousReadings={previousReadings}/>');

const files=owner+'SavedDocumentFilesV110344.jsx';
patch(files,"import {vaultBlobV102} from './documentVaultV102.js';", "import {vaultBlobV102} from './documentVaultV102.js';\nimport {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';\nimport {keepOriginalOffline} from './offlineOriginalV110371.js';");
patch(files,"  const [loadingMessage, setLoadingMessage] = useState('Opening saved file…');", "  const [loadingMessage, setLoadingMessage] = useState('Opening saved file…');\n  const [offlineNotice, setOfflineNotice] = useState('');");
patch(files,"    setLoadingMessage('Opening saved file…');", "    setLoadingMessage('Opening saved file…'); setOfflineNotice('');");
patch(files,"          blob = await response.blob(); source = 'cloud';\n          if (!active) return;", `          blob = await response.blob(); source = 'cloud';
          if (!active) return;
          try {
            await keepOriginalOffline(getOwnerOpDb(),doc,blob);
            if (!active) return;
            source='device'; setOfflineNotice('Cloud original kept on this device for offline access.');
          } catch (failure) {
            if (!active) return;
            if(failure?.code==='original_integrity_failed')throw failure;
            setOfflineNotice('Opened from cloud; offline copy was not saved. '+(failure.message||'Try again later.'));
          }`);
patch(files,"      } catch { if (active) setError('Could not open the saved file. Try again.'); }", "      } catch (failure) { if (active) setError(failure?.code==='original_integrity_failed'?failure.message:'Could not open the saved file. Try again.'); }");
patch(files,'    {current ? <>\n      <p>{current.source', '    {offlineNotice?<p role="status">{offlineNotice}</p>:null}\n    {current ? <>\n      <p>{current.source');
const css=owner+'savedDocumentFilesV110344.css';
const styles='\n/* DOCUMENT_CONTINUITY_V110371 */\n.reader-retained-v371{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0}.reader-retained-v371 small{flex-basis:100%}.reader-retained-v371 button{min-height:44px}.reader-local-status-v371{font-size:.86rem;line-height:1.5}\n';
if(!read(css).includes('DOCUMENT_CONTINUITY_V110371'))fs.appendFileSync(css,styles);

// Preserve the previous skip regression, then verify that an explicit reread
// retains it once the driver has subsequently confirmed that same date.
const browser='scripts/browser-fullscreen-reader-v110369.mjs';
patch(browser,"  await dialog.getByLabel('Confirmed value',{exact:true}).fill('2026-09-07');", `  await dialog.getByRole('button',{name:'Skip for now',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  assert.equal(await review.getByRole('button',{name:'Check Document date source',exact:true}).count(),1,'skipping leaves the date unchecked');
  await review.getByRole('button',{name:'Fix next reading',exact:true}).click();
  await dialog.getByRole('heading',{name:'Document date · Page 1',exact:true}).waitFor();
  await dialog.getByLabel('Confirmed value',{exact:true}).fill('2026-09-07');`);
patch(browser,"  await reread.getByRole('button',{name:'Fix next reading',exact:true}).click();", "  await reread.getByRole('button',{name:'Review saved VIN',exact:true}).click();");
patch(browser,"  await dialog.getByRole('button',{name:'Skip for now',exact:true}).click();\n  await dialog.getByRole('heading',{name:'Save this reading',exact:true}).waitFor();", "  // A confirmed date is retained; there is no extra unchecked date to skip.\n  await dialog.getByRole('heading',{name:'Save this reading',exact:true}).waitFor();");
patch(browser,"  await dialog.getByRole('button',{name:'Save reading',exact:true}).click();", `  await reread.getByText('Confirmed changes saved on this device.',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Return to document',exact:true}).click();
  await reread.getByRole('button',{name:'Cancel reading',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();
  await recent.locator('.saved-document-row-v344').first().click();
  await recent.getByRole('button',{name:'Read again',exact:true}).click();
  await reread.getByRole('button',{name:'Review saved VIN',exact:true}).click();
  assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),'1HGBH41JXMN109188','unfinished confirmed correction survives reload and reread');
  await dialog.getByRole('button',{name:'Finish review',exact:true}).click();
  await dialog.getByRole('button',{name:'Save reading',exact:true}).click();`);
patch(browser,"assert.ok(saved.remaining>0,'skipped date stays unchecked');", "assert.ok(Object.values(saved.documents[0].fields).some(field=>field.label==='Document date'&&field.value==='2026-09-07'&&field.correction?.confirmed),'previously confirmed date survives reread');assert.equal(records[0].extracted.readerContinuityV110371.draft,null,'final save clears checkpoint atomically');");
console.log('PASS — document confirmations, recovery checkpoints and offline originals installed');
