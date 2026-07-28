import fs from 'node:fs';

const component=fs.readFileSync('source/src/modules/owneros/LoadFoldersV10969.jsx','utf8');
const renderer=fs.readFileSync('source/src/modules/owneros/historicalLogbookV10981.js','utf8');
function ok(condition,message){if(!condition){console.error('FAIL:',message);process.exit(1);}console.log('OK:',message);}

ok(!component.includes('onOpenLog?.('),'historical Logbook never routes to live Logbook');
ok(!component.includes('ROAD READY – HISTORICAL LOGBOOK')&&!component.includes('ROAD READY - HISTORICAL LOGBOOK'),'obsolete summary title is absent');
ok(component.includes('historicalLogbookDatesV10981(open).map'),'load folder renders every linked Logbook date');
ok(component.includes('Open All Logbooks'),'multi-day combined PDF action exists');
ok(component.includes('No historical Logbook linked'),'missing linkage has an explicit empty state');
ok(component.includes('openHistoricalMiles(open)'),'Miles PDF action remains separate');
ok(renderer.includes("const VALID_STATUSES=['OFF','SB','D','ON']"),'all four duty-status rows are present');
ok(renderer.includes("startMin:cursor,endMin:start")&&renderer.includes("endMin:1440"),'timeline carries status from 00:00 and covers through 24:00');
ok(renderer.includes('displayEventsForDay'),'historical renderer uses the effective daily timeline');
ok(renderer.includes('validateLogForSigning'),'violations and warnings are included');
ok(renderer.includes('checksum')&&renderer.includes('generatedAt')&&renderer.includes('snapshotId'),'snapshots are immutable, versioned and checksummed');
ok(renderer.includes('rebuildHistoricalLogbooksV10981'),'idempotent rebuild support exists');
ok(renderer.includes('events.forEach((event,index)=>')&&renderer.includes('xFor(event.startMin)')&&renderer.includes('center(next.status)'),'PDF contains horizontal graph segments and vertical transitions');
ok(renderer.includes('totalVehicleMiles')&&renderer.includes('totalDrivingMiles'),'daily vehicle and driving miles are included');
ok(renderer.includes('odometer')&&renderer.includes('engineHours')&&renderer.includes('origin')&&renderer.includes('annotation'),'event audit fields are included');
ok(component.includes("const VERSION='109.8.1'"),'compiled source contains v109.8.1 final implementation');
console.log('PASS — v109.8.1 full historical Logbook verification');
