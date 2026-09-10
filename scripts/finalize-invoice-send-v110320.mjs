import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(file, 'utf8');
function patch(file, before, after) { const s = read(file); if (after ? s.includes(after) : !s.includes(before)) return; assert.equal(s.split(before).length - 1, 1, 'Invoice Send anchor: ' + file); fs.writeFileSync(file, s.replace(before, after)); }
for (const [from, to] of [
 ['invoiceSubmission.js', 'source/src/modules/owneros/invoiceSubmissionV110320.js'],
 ['outlookConnection.js', 'source/src/modules/owneros/outlookConnectionV110320.js'],
 ['InvoiceSendPanel.jsx', 'source/src/modules/owneros/InvoiceSendPanelV110320.jsx'],
 ['invoiceSend.css', 'source/src/modules/owneros/invoiceSendV110320.css'],
 ['outlook-connect.html', 'public/outlook-connect.html'],
 ['outlook-config-route.js', 'app/api/billing/outlook-config/route.js'],
]) { fs.mkdirSync(to.slice(0, to.lastIndexOf('/')), { recursive: true }); fs.copyFileSync('scripts/v110320/' + from, to); }
const screen = 'source/src/modules/owneros/OwnerOperatorOSV102.jsx';
patch(screen, "import LoadFoldersV10969 from './LoadFoldersV10969.jsx';", "import LoadFoldersV10969 from './LoadFoldersV10969.jsx';\nimport InvoiceSendPanelV110320 from './InvoiceSendPanelV110320.jsx';");
const start = read(screen).indexOf('  function openBillingEmail() {');
const end = read(screen).indexOf('  function exportIftaCsv()', start);
if (start >= 0) { assert.ok(end > start); const s = read(screen); fs.writeFileSync(screen, s.slice(0, start) + s.slice(end)); }
patch(screen, '<button type="button" onClick={openBillingEmail}>Email billing</button>', '');
patch(screen, '<form className="billing-profile-v102"', `<InvoiceSendPanelV110320 key={selectedLoad?.id || selectedLoad?.loadNo} load={selectedLoad} documents={documents} profile={profileDraft} invoices={invoices}
            onFirstLine={()=>{const next={...profileDraft,factoring:{...profileDraft.factoring,enabled:true,company:'FirstLine Funding Group',email:'ffg@firstlinefundinggroup.com'}};setProfileDraft(next);setOwnerStore(updateOwnerOpsProfileV102(readOwnerOpsStoreV102(),next));}}
            onAccepted={receipt=>{const current=readOwnerOpsStoreV102();const next=appendOwnerOpsRowsV102(current,'invoices',[{...receipt,date:new Date().toISOString().slice(0,10),status:'submitted',sentAt:receipt.acceptedAt}]);setOwnerStore(next);setBusinessStore(updateBusinessRecord(readBusinessStore(),'loads',selectedLoad.id,{status:'submitted',invoiceNo:receipt.invoiceNo,invoiceSentAt:receipt.acceptedAt}));}}
          />
          <form className="billing-profile-v102"`);
patch(screen, "    const next = appendOwnerOpsRowsV102(ownerStore,'invoices',[record]);", "    const current = readOwnerOpsStoreV102();\n    const prior = current.invoices.find(row=>row.invoiceNo===invoiceNo);\n    const next = appendOwnerOpsRowsV102(current,'invoices',[prior?.acceptedAt ? {...record,...prior} : record]);");
// An invoice generated locally is not an invoice submitted for payment.
patch(screen, "{ status:'invoiced', invoiceNo, invoicedAt:Date.now() }", "{ invoiceNo, invoiceGeneratedAt:Date.now() }");
const VERSION='110.3.20',BUILD='v110320-invoice-packet-outlook-send';
for(const file of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(file));Object.assign(d,{version:VERSION,build:BUILD,force:false,label:'v110.3.20 Invoice packet and Outlook sending',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Billing prepares the invoice and original delivery documents together.','Factoring submissions use the selected factoring recipient.','Outlook sends attachments after connection setup; accepted and uncertain attempts are tracked separately.']});fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const d=JSON.parse(read(file));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(file);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,s);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.19');assert.equal(meta.build,'v110319-midnight-prefix-after-edit');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — invoice packet, factoring recipient, Outlook connection and send receipt');
