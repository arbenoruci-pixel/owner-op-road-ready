import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='source/src/modules/editor/InsertEditEventSheet.jsx';
let s=fs.readFileSync(path,'utf8');
if(!s.includes('COMPACT_INSERT_ACTIVITY_V111')){
 const before='      <div className="insert-driver-block">';
 assert.equal(s.split(before).length,2,'Insert activity anchor changed');
 s=s.replace(before,`      {/* COMPACT_INSERT_ACTIVITY_V111: selected activity stays visible; expand to change. */}
      <details className="compact-activities-v111"><summary>Activity <strong>{selectedReasons.length ? selectedReasons.join(' · ') : actionHeadingForStatus(form.status)}</strong></summary>
      <div className="insert-driver-block">`);
 const end='      </div>\n\n        <EditorLocationFields';
 assert.equal(s.split(end).length,2,'Insert activity closing anchor changed');
 s=s.replace(end,'      </div></details>\n\n        <EditorLocationFields');
 fs.writeFileSync(path,s);
}
const cssPath='source/src/modules/editor/compact-editor-v111.css';
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('COMPACT_FOOTER_CONTRAST_V111')){
 css+=`\n/* COMPACT_FOOTER_CONTRAST_V111: eliminate inherited transition/opacity states. */
.sheet.editor-ui-v110.editor-compact-v111 .compact-editor-footer-v111 button.save-main{background:#00765e!important;color:#fff!important;-webkit-text-fill-color:#fff!important;opacity:1!important;transition:none!important;filter:none!important;font-weight:650!important}
.sheet.editor-ui-v110.editor-compact-v111 .compact-editor-footer-v111 button.save-main:disabled{background:#dce7e4!important;color:#425c54!important;-webkit-text-fill-color:#425c54!important;opacity:1!important;cursor:default!important}
.sheet.editor-ui-v110.editor-compact-v111 .compact-editor-footer-v111 button.cancel-main{color:#334155!important;-webkit-text-fill-color:#334155!important;background:#e8eef6!important;opacity:1!important;transition:none!important}
.editor-ui-v110.editor-compact-v111 .compact-activities-v111[open]>.insert-driver-block{padding:4px 0 8px!important}
`;
 fs.writeFileSync(cssPath,css);
}
assert.match(s,/COMPACT_INSERT_ACTIVITY_V111/);
assert.match(css,/button.save-main:disabled\{background:#dce7e4!important;color:#425c54/);
// New release identifier for the post-merge responsive fix. All contracts run
// after this finalization, against the same identifiers that Next will publish.
const VERSION='110.2.2',BUILD='v110202-compact-handles';
for(const p of ['release-version.json','public/app-version.json']){
 const meta=JSON.parse(fs.readFileSync(p,'utf8'));fs.writeFileSync(p,JSON.stringify({...meta,version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null},null,2)+'\n');
}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let s=fs.readFileSync(p,'utf8');
 s=s.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);fs.writeFileSync(p,s);
}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/App v110\.2\.1/g,'App v'+VERSION).replace(/APP V110\.2\.1/g,'APP V'+VERSION));
console.log('PASS — compact Insert/footer contrast; bounded responsive handles release '+VERSION);
