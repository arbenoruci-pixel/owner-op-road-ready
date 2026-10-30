import {eightDays, homeDay, minuteAt, profileFromState} from '../../../../lib/owner-op-cloud/core.js';
import {getHomeTerminalTimeZone} from '../../core/time/homeTerminalTime.js';
import {readLogbookReportDay, logbookReportGaps, certificationStatusV1032, validateLogForSigning} from '../logbook/public-api.js';

export function inspectionReadiness(state, at = new Date()) {
  const zone = getHomeTerminalTimeZone(state), today = homeDay(at, zone), profile = profileFromState(state);
  const fields = [['driverName','Driver'],['carrierName','Carrier'],['usdot','USDOT'],['unit','Truck'],['mainOffice','Main office']];
  const missing = fields.filter(([key]) => !String(profile[key] || '').trim()).map(([,label]) => label);
  const days = eightDays(today).map(day => {
    const end = day === today ? minuteAt(at, zone) : 1440;
    const events = readLogbookReportDay(state, day, at, zone);
    const gaps = logbookReportGaps(events, end);
    const certification = certificationStatusV1032(state, day);
    const signed = day === today || certification.status === 'Certified' && certification.signed === true && !certification.changed;
    const issues = validateLogForSigning(state, day).filter(issue => issue.code !== 'active_day');
    return {day, today:day === today, eventCount:events.length, gaps, signed, issues,
      blocked:gaps.length > 0 || !signed || (end > 0 && !events.length)};
  });
  return {today, zone, profile, missing, days, logsReady:days.every(day => !day.blocked)};
}

export function officerEmailLink(email, share, origin) {
  const to = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(to) || /[\r\n]/.test(to)) return '';
  if (!share?.token || !share?.inspection || !Number.isFinite(Date.parse(share.expires_at)) || Date.parse(share.expires_at) <= Date.now()) return '';
  const p = share.inspection.profile, days = share.inspection.snapshots.map(s => s.sourceDay);
  const url = origin + '/inspection#' + share.token;
  const subject = `DOT Inspection Logs - ${p.carrierName} - ${p.unit}`;
  const body = [`Driver: ${p.driverName}`,`Carrier: ${p.carrierName} · USDOT ${p.usdot}`,
    `Truck: ${p.unit} · Trailer: ${p.trailer || 'Not recorded'}`,`Log dates: ${days[0]} through ${days.at(-1)}`,
    `Captured: ${share.inspection.capturedAt} (${share.inspection.timeZone})`,'',
    'Please open this private Road Ready inspection link:',url,'',
    `Expires: ${new Date(share.expires_at).toLocaleString()}`,
    'Manual RODS · current day and previous 7 days. Supporting documents will be presented separately.',
    'This is not an FMCSA eRODS transfer.'].join('\n');
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
