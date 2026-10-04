import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;if(s.split(b).length!==2)throw Error('Wallet import anchor changed: '+p);fs.writeFileSync(p,s.replace(b,a));}
const dir='source/src/modules/wallet/';
fs.copyFileSync('scripts/v110443/walletImport.js',dir+'walletImportV110443.js');
fs.copyFileSync('scripts/v110443/WalletImportPanel.jsx',dir+'WalletImportPanelV110443.jsx');
const core='source/src/core/wallet/dotWallet.js';
patch(core,"export const DOT_DOCUMENT_REQUIREMENTS = [","export const DOT_DOCUMENT_REQUIREMENTS = [\n  {id:'supporting_permits',section:'supporting',title:'Permits and roadside reports',shortTitle:'Permits',required:'supporting_docs',expirationRequired:false,fields:[],detail:'Saved permit and inspection copies, with their source notes.'},");
patch(core,"if (doc.expiresOn) return doc.expiresOn;","if (doc.expiresOn) return doc.expiresOn;\n  if (/^\\d{4}-(0[1-9]|1[0-2])$/.test(doc.expiresMonth||'')) { const [y,m]=doc.expiresMonth.split('-').map(Number); return `${doc.expiresMonth}-${new Date(y,m,0).getDate()}`; }");
const screen=dir+'DigitalWalletScreen.jsx';
patch(screen,"import CloudLaunchBar", "import WalletImportPanel from './WalletImportPanelV110443.jsx';\nimport {DotDocumentViewer} from '../dot/DotMode.jsx';\nimport CloudLaunchBar");
patch(screen,"onSaveDocument, onOpenLogs", "onSaveDocument, onApplyWallet, onOpenLogs");
patch(screen,"const [editingDocId, setEditingDocId] = useState(null);","const [editingDocId, setEditingDocId] = useState(null);\n  const [viewingFile,setViewingFile]=useState(null);");
patch(screen,"<WalletOverview summary={summary}","<WalletImportPanel wallet={wallet} onApply={onApplyWallet} />\n      <WalletOverview summary={summary}");
patch(screen,"function DocEditor({ wallet, docId, onClose, onSave })", "function DocEditor({ wallet, docId, onClose, onSave, onView })");
patch(screen,"<span>Expiration date</span><input type=\"date\" value={draft.expiresOn || ''} onChange={e => patch('expiresOn', e.target.value)} />", "<span>{draft.expiresMonth?'Expiration month':'Expiration date'}</span><input type={draft.expiresMonth?'month':'date'} value={draft.expiresMonth||draft.expiresOn||''} onChange={e=>patch(draft.expiresMonth?'expiresMonth':'expiresOn',e.target.value)} />");
patch(screen,"<div className=\"wallet-editor-actions\">",`<div className="wallet-editor-actions">
            {(draft.attachmentDataUrl||draft.photoDataUrl)?<button type="button" onClick={()=>onView({doc:draft,requirement:req})}>Open saved document</button>:null}
            {(draft.previousVersions||[]).map((doc,i)=><button type="button" key={i} onClick={()=>onView({doc,requirement:req})}>Previous copy {i+1}</button>)}`);
patch(screen,"onSave={saveDoc} />", "onSave={saveDoc} onView={setViewingFile} />");
patch(screen,"{editingDocId ? (", "{viewingFile?<DotDocumentViewer row={viewingFile} backLabel=\"Back to Wallet\" onClose={()=>setViewingFile(null)} />:null}\n      {editingDocId ? (");
patch('source/src/modules/dot/DotMode.jsx',"function DotDocumentViewer({ row", "export function DotDocumentViewer({ row");
patch('source/src/modules/dot/DotMode.jsx',"row, onClose, onStatus })", "row, onClose, onStatus, backLabel='Back to DOT package' })");
patch('source/src/modules/dot/DotMode.jsx','onClick={onClose} aria-label="Back to DOT package"','onClick={onClose} aria-label={backLabel}');
const app='source/src/app/App.jsx';
patch(app,"import DigitalWalletScreen", "import {walletFingerprint} from '../modules/wallet/walletImportV110443.js';\nimport DigitalWalletScreen");
patch(app,"onSaveDocument={saveWalletDocument}","onSaveDocument={saveWalletDocument}\n      onApplyWallet={(wallet,before)=>{if(walletFingerprint(state.dotWallet)!==before)throw Error('Wallet changed. Review the file again.');setState(current=>walletFingerprint(current.dotWallet)===before?{...current,dotWallet:wallet}:current);}}");
patch(app,"saveAppSnapshot(APP_STATE_KEY, state).catch(() => {});", "saveAppSnapshot(APP_STATE_KEY, state).then(savedAt=>{if(state.dotWallet?.lastImport?.token)window.dispatchEvent(new CustomEvent('road-ready-wallet-saved',{detail:{token:state.dotWallet.lastImport.token,error:!savedAt}}));}).catch(()=>{if(state.dotWallet?.lastImport?.token)window.dispatchEvent(new CustomEvent('road-ready-wallet-saved',{detail:{token:state.dotWallet.lastImport.token,error:true}}));});");
const css='source/src/modules/wallet/walletImportV110443.css';fs.writeFileSync(css,`.wallet-import-card{margin:16px 0;padding:18px;background:var(--card,#fff);border:1px solid #cbd5e1;border-radius:18px;color:var(--ink,#172b45)}.wallet-import-card h2{font-size:20px;margin:0 0 8px}.wallet-import-card p{line-height:1.45;overflow-wrap:anywhere}.wallet-import-card button{min-height:46px;border:0;border-radius:12px;background:#0868d9;color:#fff;font:inherit;font-weight:700;padding:12px 16px;margin:4px 8px 4px 0}.wallet-import-card button:disabled{opacity:.6}.wallet-import-card ul{list-style:none;padding:0}.wallet-import-card li{padding:10px 0;border-bottom:1px solid #dbe3ed}.wallet-import-card li span{display:block;font-size:14px;margin-top:4px}.wallet-import-card [role=alert]{color:#b4232b}.wallet-import-card [role=status]{font-weight:700}.wallet-import-card h3{overflow-wrap:anywhere}.wallet-screen .wallet-head b,.wallet-screen .wallet-status b,.wallet-screen .wallet-score strong,.wallet-screen .wallet-roadside-note b,.wallet-screen .wallet-editor-head b,.wallet-screen .wallet-file-card b{color:#172b45!important}`);
patch(screen,"import WalletImportPanel", "import './walletImportV110443.css';\nimport WalletImportPanel");
const VERSION='110.4.43',BUILD='v110443-wallet-documents';
for(const p of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.43 Wallet documents',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Import reviewed Wallet documents with source checks and saved previous copies.','Open current and previous originals directly from Wallet.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replaceAll('v110.4.42','v'+VERSION).replaceAll('V110.4.42','V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.42'","'"+VERSION+"'").replaceAll("'v110442-load-evidence'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.43 reviewed Wallet imports, original viewer and preserved history');
