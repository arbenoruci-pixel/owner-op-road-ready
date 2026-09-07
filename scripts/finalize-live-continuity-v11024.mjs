import fs from 'node:fs';
import assert from 'node:assert/strict';
const graphPath='source/src/modules/editor/components/CompactGraphPanelV111.jsx';
let graph=fs.readFileSync(graphPath,'utf8');
const oldToolbar=`<div className="compact-graph-toolbar-v111"><span>{editable ? 'Drag Start and End to edit event time' : selected?.isLive ? 'Live timeline · Now' : 'Duty timeline'}</span><button`;
const newToolbar=`<div className="compact-graph-toolbar-v111 compact-graph-toolbar-minimal-v11024"><button`;
if(graph.includes(oldToolbar)) graph=graph.replace(oldToolbar,newToolbar);
assert.ok(graph.includes('compact-graph-toolbar-minimal-v11024'),'compact graph toolbar contract missing');fs.writeFileSync(graphPath,graph);
const cssPath='source/src/modules/editor/compact-editor-v111.css';let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('LIVE_CONTINUITY_COMPACT_V11024')) css+=`
/* LIVE_CONTINUITY_COMPACT_V11024: reclaim vertical space; blocking errors stay visible. */
.editor-ui-v110.editor-compact-v111 .compact-graph-toolbar-minimal-v11024{justify-content:flex-end!important;height:24px!important}
.editor-ui-v110.editor-compact-v111 .compact-graph-toolbar-minimal-v11024 button{height:24px!important;min-height:24px!important}
.editor-ui-v110.editor-compact-v111 .motive-override-help-v11023:not(.blocked){display:none!important}
.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .form-label-row{display:none!important}
.editor-ui-v110.editor-compact-v111 .quick-activities-head-v11023 span{display:none!important}
.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .drop-hook-note{display:none!important}
.editor-ui-v110.editor-compact-v111 .quick-activities-head-v11023{margin-bottom:4px!important}
`;fs.writeFileSync(cssPath,css);
const VERSION='110.2.4',BUILD='v110204-live-continuity-compact';
for(const p of ['release-version.json','public/app-version.json']){const meta=JSON.parse(fs.readFileSync(p,'utf8'));Object.assign(meta,{version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,label:'Connected live duty timeline + compact quick activities',notes:['Current OFF/SB/ON/Driving projects continuously to Now until the next status change.','Manual override and automatic Driving protections remain unchanged.','Helper copy is compacted so quick activities stay visible higher on the phone.']});fs.writeFileSync(p,JSON.stringify(meta,null,2)+'\n');}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let source=fs.readFileSync(p,'utf8');source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);fs.writeFileSync(p,source);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){let source=fs.readFileSync(p,'utf8');source=source.replace(/App v110\.2\.3/g,`App v${VERSION}`).replace(/APP V110\.2\.3/g,`APP V${VERSION}`);fs.writeFileSync(p,source);}
const legacyTest='scripts/test-motive-override-v11023.mjs';let legacy=fs.readFileSync(legacyTest,'utf8');legacy=legacy.replace("assert.equal(m.version,'110.2.3');assert.equal(m.build,'v110203-motive-override-chips')",`assert.equal(m.version,'${VERSION}');assert.equal(m.build,'${BUILD}')`);fs.writeFileSync(legacyTest,legacy);
console.log('PASS — 110.2.4 live timeline and compact helper copy finalized');
