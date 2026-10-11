import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,before,after){const s=read(p);if(s.includes(after))return;assert.equal(s.split(before).length,2,'Solo membership anchor: '+p);fs.writeFileSync(p,s.replace(before,()=>after));}
fs.copyFileSync('scripts/solo-driver/formTeam.js','source/src/core/team/formTeamV110448.js');
fs.copyFileSync('scripts/solo-driver/TeamDriverBar.jsx','source/src/modules/logbook/TeamDriverBar.jsx');
const team='source/src/core/team/teamLogbook.js';
patch(team,'  const names = teamDrivers.filter(driver => driver.id !== activeDriver.id).map(driver => driver.name);',
`  const hasSelection=Array.isArray(state.activeTeamDriverIds);
  const names = teamDrivers.filter(driver => driver.id !== activeDriver.id && (!hasSelection || state.activeTeamDriverIds.includes(driver.id))).map(driver => driver.name);`);
patch(team,'  if (legacyCoDrivers && !teamDrivers.some(', '  if (!hasSelection && legacyCoDrivers && !teamDrivers.some(');
patch(team,'  if (!target || target.id === normalized.activeDriverId) return normalized;',
 '  if (!target || target.id === normalized.activeDriverId || (Array.isArray(normalized.activeTeamDriverIds) && !normalized.activeTeamDriverIds.includes(target.id))) return normalized;');
const app='source/src/app/App.jsx';
patch(app,'import {registerFormTeamDrivers}', 'import {registerFormTeamDrivers,addCurrentCoDriver,removeCurrentCoDriver}');
patch(app,'      const next = addTeamDriver(s, name, day);','      const next = addCurrentCoDriver(s, name, s.activeDay || day);');
patch(app,'  function switchActiveTeamDriver(driverId) {',`  function removeTeamCoDriver(driverId) {
    setState(s => removeCurrentCoDriver(s, driverId, s.activeDay));
  }

  function switchActiveTeamDriver(driverId) {`);
let s=read(app);
if(!s.includes('onRemoveDriver={removeTeamCoDriver}')){
  assert.equal(s.split('onAddDriver={addTeamDriverToLogbook}').length,3);
  s=s.replaceAll('onAddDriver={addTeamDriverToLogbook}','onAddDriver={addTeamDriverToLogbook}\n        onRemoveDriver={removeTeamCoDriver}');fs.writeFileSync(app,s);
}
const css='source/src/team-driver-v110405.css';
if(!read(css).includes('/* Explicit Solo membership */'))fs.appendFileSync(css,`\n/* Explicit Solo membership */
.team-driver-list>.team-driver-remove{display:block;min-height:44px;color:#b42318;text-align:center;border-color:#fecaca;background:#fff7f7;font-weight:700}
.team-driver-add{grid-template-columns:minmax(0,1fr) 110px}
.team-driver-add input,.team-driver-add button{min-height:44px}
.team-driver-panel{max-height:70dvh;overflow-y:auto}
.team-driver-panel>strong{display:block;margin:4px 2px 10px;color:#182334}
`);
console.log('PASS explicit Add/Remove co-driver controls and persistent Solo membership installed');
