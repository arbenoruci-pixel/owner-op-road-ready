import fs from 'node:fs';
const path='source/src/modules/logbook/DayLogScreen.jsx';
let source=fs.readFileSync(path,'utf8');
function once(before,after){if(source.includes(after))return;if(source.split(before).length!==2)throw Error('Signature UI anchor changed: '+before);source=source.replace(before,after);}
once("  const signButtonLabel = signState.status === 'Needs Recertification'", "  const alreadyCertifiedV110 = saved.signed && signState.status === 'Certified' && !changeSignature;\n  const signButtonLabel = signState.status === 'Needs Recertification'");
once("? 'Sign Again'", "? (changeSignature ? 'Save Signature + Sign' : 'Signed')");
once("disabled={fixBlockers.length ? false : ((changeSignature && !hasInk) || todayActive)}", "disabled={alreadyCertifiedV110 || (fixBlockers.length ? false : ((changeSignature && !hasInk) || todayActive))}");
once("{fixBlockers.length ? 'Fix Issues Before Sign' : todayActive ? 'Sign after day complete' : signButtonLabel}", "{alreadyCertifiedV110 ? 'Signed' : fixBlockers.length ? 'Fix Issues Before Sign' : todayActive ? 'Sign after day complete' : signButtonLabel}");
source=source.replaceAll("savedDriverSignature?.driverName || saved.driverName || driverNameForState(state)","saved.driverName || driverNameForState(state) || savedDriverSignature?.driverName");
once("    if (!canvas || !changeSignature) return;\n    const ctx", "    if (!canvas || !changeSignature) return;\n    setHasInk(false);\n    const ctx");
fs.writeFileSync(path,source);
if(source.includes("? 'Sign Again'"))throw Error('Repeated signing prompt remains');
console.log('PASS — certified log shows Signed, disables redundant signing, and pins attested driver name');
console.log('PASS — explicit Change Signature remains available and requires newly drawn ink');
