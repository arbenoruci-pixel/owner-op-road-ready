import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION='110.3.3';
const BUILD='v110303-smart-load-identity';
const FOUNDATION='source/src/modules/documents/documentFoundationV105.js';
const ENGINE='source/src/modules/scan/truckDocumentEngineV1040.js';
const read=path=>fs.readFileSync(path,'utf8');
const write=(path,value)=>fs.writeFileSync(path,value);

function replaceOnce(source,before,after,label){
  if(source.includes(after)) return source;
  const count=source.split(before).length-1;
  assert.equal(count,1,`110.3.3 anchor changed: ${label}; found ${count}`);
  return source.replace(before,after);
}

// Rate confirmations often identify the broker by header/acronym/contact domain instead
// of a literal "Broker:" label. Preserve that identity so load-folder matching can use it.
{
  let source=read(ENGINE);
  const anchor="  common.broker = fields.broker || common.broker;";
  const replacement=`  const brokerIdentityV11033 = /(?:\\bTOTAL\\s+QUALITY\\s+LOGISTICS\\b|\\bTQL\\s+(?:CONTACT\\s+INFO|PO\\s*#)|@[A-Z0-9._%+-]*TQL\\.COM\\b)/i.test(source)\n    ? 'Total Quality Logistics (TQL)'\n    : '';\n  common.broker = fields.broker || common.broker || brokerIdentityV11033;`;
  source=replaceOnce(source,anchor,replacement,'Rate Con broker identity extraction');
  write(ENGINE,source);
}

{
  let source=read(FOUNDATION);
  const helperAnchor=`function sameWordsV105(a = '', b = '') {\n  const left = textV105(a).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim();\n  const right = textV105(b).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim();\n  if (!left || !right) return false;\n  return left === right || left.includes(right) || right.includes(left);\n}`;
  const helpers=`${helperAnchor}\n\n// v110.3.3: broker identity is a first-class matching key for load documents.\n// Numeric references can repeat across brokers, so they may corroborate identity but\n// may never override an explicit broker conflict.\nfunction brokerKeyV11033(value = '') {\n  return textV105(value).toLowerCase()\n    .replace(/\\b(?:llc|inc|corp|corporation|company|co|ltd|logistics|transportation|transport)\\b/g, ' ')\n    .replace(/[^a-z0-9]/g, '')\n    .trim();\n}\n\nfunction documentBrokerIdentityV11033(fields = {}, analysis = {}) {\n  const f = { ...(analysis.fields || {}), ...(fields || {}) };\n  const explicit = textV105(f.broker || f.brokerName);\n  const raw = textV105(analysis.text || analysis.rawText || f.rawText || '');\n  const tql = /(?:\\bTOTAL\\s+QUALITY\\s+LOGISTICS\\b|\\bTQL\\s+(?:CONTACT\\s+INFO|PO\\s*#)|@[A-Z0-9._%+-]*TQL\\.COM\\b)/i.test(raw)\n    || /total\\s+quality\\s+logistics|\\btql\\b/i.test(explicit);\n  if (tql) return { name:'Total Quality Logistics (TQL)', key:'tql', strong:true, source:'document header/contact' };\n  if (explicit) return { name:explicit, key:brokerKeyV11033(explicit), strong:true, source:'broker field' };\n  return { name:'', key:'', strong:false, source:'' };\n}\n\nfunction brokerRelationshipV11033(identity = {}, candidateBroker = '', rawText = '') {\n  const candidate = textV105(candidateBroker);\n  if (!identity?.strong || !candidate) return 'unknown';\n  if (identity.key === 'tql') {\n    return /total\\s+quality\\s+logistics|\\btql\\b/i.test(candidate) ? 'match' : 'conflict';\n  }\n  if (sameWordsV105(identity.name, candidate)) return 'match';\n  const left = brokerKeyV11033(identity.name);\n  const right = brokerKeyV11033(candidate);\n  if (left && right && (left === right || left.includes(right) || right.includes(left))) return 'match';\n  const raw = textV105(rawText);\n  if (raw && candidate.length >= 5 && raw.toLowerCase().includes(candidate.toLowerCase())) return 'match';\n  return 'conflict';\n}`;
  source=replaceOnce(source,helperAnchor,helpers,'broker identity helpers');

  source=replaceOnce(source,
`  const broker = textV105(f.broker);\n  const loadLike = LOAD_DOCUMENT_TYPES_V105.has(typeId);`,
`  const broker = textV105(f.broker);\n  const loadLike = LOAD_DOCUMENT_TYPES_V105.has(typeId);\n  const brokerIdentityV11033 = documentBrokerIdentityV11033(f, analysis);\n  const rawDocumentTextV11033 = textV105(analysis.text || analysis.rawText || '');\n  const brokerIdentityRequiredV11033 = ['rate_confirmation','load_tender'].includes(typeId) && brokerIdentityV11033.strong;`,
'broker identity context');

  source=replaceOnce(source,
`    if (broker && candidate.broker && sameWordsV105(broker, candidate.broker)) {\n      score += 28;\n      reasons.push('Broker matches');\n    }`,
`    const brokerRelationship = brokerRelationshipV11033(brokerIdentityV11033, candidate.broker, rawDocumentTextV11033);\n    const brokerIdentityMatch = brokerRelationship === 'match';\n    const brokerIdentityConflict = brokerRelationship === 'conflict';\n    if (brokerIdentityMatch) {\n      score += 72;\n      reasons.push('Broker identity matches');\n    } else if (brokerIdentityConflict) {\n      score -= 260;\n      reasons.push('Broker identity conflicts with this load');\n    } else if (broker && candidate.broker && sameWordsV105(broker, candidate.broker)) {\n      score += 28;\n      reasons.push('Broker matches');\n    }`,
'broker scoring');

  source=replaceOnce(source,
`      strongReference,\n    };`,
`      strongReference,\n      brokerIdentityMatch,\n      brokerIdentityConflict,\n    };`,
'candidate broker identity flags');

  source=replaceOnce(source,
`  const top = ranked[0] || null;\n  const second = ranked[1] || null;\n  const margin = top ? top.matchScore - Number(second?.matchScore || 0) : 0;\n  let chosen = top;`,
`  const eligibleRankedV11033 = ranked.filter(candidate => !candidate.brokerIdentityConflict);\n  const top = eligibleRankedV11033[0] || null;\n  const second = eligibleRankedV11033[1] || null;\n  const margin = top ? top.matchScore - Number(second?.matchScore || 0) : 0;\n  let chosen = top;`,
'exclude broker conflicts');

  source=replaceOnce(source,
`  if ((!chosen || chosen.matchScore < 24) && active && loadLike) {`,
`  if ((!chosen || chosen.matchScore < 24) && active && loadLike && !brokerIdentityRequiredV11033) {`,
'active-load fallback identity guard');

  source=replaceOnce(source,
`  const confidence = score >= 150 ? .99 : score >= 110 ? .95 : score >= 85 ? .88 : score >= 55 ? .76 : score >= 30 ? .62 : .38;\n  const automatic = Boolean(chosen && score >= 90 && margin >= 20);`,
`  const confidenceBaseV11033 = score >= 150 ? .99 : score >= 110 ? .95 : score >= 85 ? .88 : score >= 55 ? .76 : score >= 30 ? .62 : .38;\n  const identityVerifiedV11033 = !brokerIdentityRequiredV11033 || Boolean(chosen?.brokerIdentityMatch);\n  const confidence = identityVerifiedV11033 ? confidenceBaseV11033 : Math.min(.68, confidenceBaseV11033);\n  const automatic = Boolean(chosen && score >= 90 && margin >= 20 && identityVerifiedV11033);`,
'confidence identity gate');

  source=replaceOnce(source,
`    reason:chosen?.matchReasons?.join(' · ') || (loadLike ? 'Choose the correct load' : 'No load needed'),`,
`    reason:chosen?.matchReasons?.join(' · ') || (brokerIdentityRequiredV11033 ? 'Broker identity does not match an existing load · choose or create the correct load' : loadLike ? 'Choose the correct load' : 'No load needed'),`,
'identity review reason');

  write(FOUNDATION,source);
}

for(const path of ['package.json','package-lock.json']) if(fs.existsSync(path)){
  const data=JSON.parse(read(path));
  data.version=VERSION;
  if(data.packages?.['']) data.packages[''].version=VERSION;
  write(path,JSON.stringify(data,null,2)+'\n');
}
const releasedAt=new Date().toISOString();
write('public/app-version.json',JSON.stringify({
  version:VERSION,build:BUILD,releasedAt,updatedAt:releasedAt,label:'v110.3.3 Smart Load Identity',force:true,
  notes:[
    'Broker identity is now a first-class load-folder matching signal for Rate Confirmations and load tenders.',
    'A matching load or PO number can no longer override an explicit broker conflict.',
    'TQL identity is recognized from Total Quality Logistics, TQL headers, TQL PO labels and @tql.com contacts.',
    'Conflicting existing folders are rejected from automatic matching and the document is sent to review/new-load flow.',
    'Route, date, stop and reference evidence remain corroborating signals after broker identity is verified.'
  ]
},null,2)+'\n');
let sw=read('public/sw.js');
sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw=sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');
update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`);
update=update.replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js',update);

console.log('PASS — v110.3.3 smart broker/load identity guard applied');
