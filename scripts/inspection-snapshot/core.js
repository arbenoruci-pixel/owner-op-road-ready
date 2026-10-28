import { canonical, eightDays, homeDay, minuteAt, makeSnapshot, profileFromState } from './core.js';
import { buildDayBackupPayload } from '../../source/src/core/backup/dayTransfer.js';
import { getHomeTerminalTimeZone } from '../../source/src/core/time/homeTerminalTime.js';
import { readLogbookReportDay, readLogbookDayState } from '../../source/src/modules/logbook/public-api.js';
import { certificationStatusV1032 } from '../../source/src/modules/logbook/certificationV110.js';

const derived = new Set(['timeline_continuity','carryover','display','display_timeline']);
const recorded = e => e && !['voided','deleted','deletedAt','syntheticCoverage','displayOnly','carriedFromPreviousDay','synthetic','continuityGenerated'].some(k=>e[k]) && !derived.has(e.source);

// A share is a separate read-only projection. Backup/import payloads and the
// driver's stored events retain their original times and certification evidence.
export function captureInspection(state, at = new Date()) {
  if (!state || typeof state !== 'object') throw Error('The current logbook is unavailable.');
  const frozen = structuredClone(state), zone = getHomeTerminalTimeZone(frozen);
  const capturedAt = at.toISOString(), endDay = homeDay(at,zone), days = eightDays(endDay);
  const snapshots = days.map(day=>{
    const snapshot = makeSnapshot(frozen,day,buildDayBackupPayload);
    const timeZone = frozen.signatureByDay?.[day]?.certificationContext?.homeTimezone || zone;
    const dayState = readLogbookDayState(frozen,day);
    const certification = certificationStatusV1032(frozen,day);
    const certified = certification.status === 'Certified' && certification.signed === true && !certification.changed;
    snapshot.profileAtBackup = profileFromState(dayState);
    snapshot.homeTerminalTimeZone = timeZone;
    snapshot.inspectionView = {
      version:1, day, capturedAt, timeZone,
      driverId:frozen.activeDriverId || frozen.teamDrivers?.[0]?.id || 'driver_primary',
      cutoff:day===endDay ? minuteAt(at,timeZone) : 1440,
      events:readLogbookReportDay(frozen,day,at,timeZone),
      certification:day===endDay ? 'Active day / Not certified yet' : certification.status,
      certified:day!==endDay && certified,
    };
    return snapshot;
  });
  return {version:1,capturedAt,endDay,timeZone:zone,profile:profileFromState(frozen),snapshots};
}

export function assertInspectionUnchanged(captured, currentState) {
  const current = captureInspection(currentState,new Date(captured.capturedAt));
  if (canonical(current)!==canonical(captured)) throw Error('The logbook changed while preparing the link. Create it again to include the latest changes.');
}

// The account workspace and the legacy daily archive are independent stores.
// Never let a partially received device silently omit known recorded events.
// An explicit deletion/edit audit can be reviewed in Logbook before sharing.
export function assertArchiveCoverage(captured, archived) {
  for (const snapshot of archived) {
    const local = captured.snapshots.find(s=>s.sourceDay===snapshot.sourceDay);
    if (!local) throw Error('Unexpected archived log date.');
    const oldDriver=snapshot.inspectionView?.driverId;
    if (oldDriver && oldDriver!==local.inspectionView.driverId) throw Error('The saved archive belongs to another driver. Review the selected driver before creating a link.');
    const rows=local.dayData.events.filter(recorded);
    const missing=(snapshot.dayData?.events||[]).filter(recorded).some(old=>!rows.some(row=>old.id ? row.id===old.id : canonical(row)===canonical(old)));
    if (missing) throw Error('This device is missing saved records for '+snapshot.sourceDay+'. Open the latest logbook or review synchronization before creating a link.');
  }
}
