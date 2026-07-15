import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => fs.writeFileSync(file(relative), content);
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.5 missing ${label}`);
  return content.replace(before, after);
}

const routePath = 'source/src/core/routes/routeNormalization.js';
let route = read(routePath);
if (!route.includes('function activeRouteScopeV105')) {
  const pattern = /export function routeLegsForDayCanonical\(state = \{\}, day = ''\) \{[\s\S]*?\n\}\n\nfunction primaryMilesDayForLeg/;
  if (!pattern.test(route)) throw new Error('v100.5 missing canonical route function');
  route = route.replace(pattern, `function routeReferenceValuesV105(value = {}) {
  return uniqueClean([
    value.shippingDocs,
    value.loadNo,
    value.bol,
    value.po,
    value.orderNo,
    value.legNo,
    value.pickupNumber,
    ...(Array.isArray(value.transitionLoadNos) ? value.transitionLoadNos : []),
  ].map(normalizeDocToken).filter(Boolean));
}

function activeRouteScopeV105(state = {}) {
  const guideId = safeText(state.activeLoadGuideId || state.loadInfo?.guideId);
  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  const refs = new Set(uniqueClean([
    ...routeReferenceValuesV105(state.loadInfo || {}),
    ...routeReferenceValuesV105(guide || {}),
    ...(Array.isArray(guide?.poNumbers) ? guide.poNumbers.map(normalizeDocToken) : []),
  ]));
  return { guideId, refs };
}

function hiddenRouteStatusV105(status = '') {
  return /^(?:cancelled|canceled|superseded|archived|dismissed)$/i.test(safeText(status));
}

function closedCarryStatusV105(status = '') {
  return /^(?:delivered|completed|closed)$/i.test(safeText(status));
}

export function routeLegsForDayCanonical(state = {}, day = '') {
  const all = Object.entries(state.routeLegsByDay || {}).flatMap(([legDay, legs]) => (
    (Array.isArray(legs) ? legs : []).map(leg => ({ ...leg, day: leg.day || legDay }))
  ));
  const dayEvents = Array.isArray(state.eventsByDay?.[day]) ? state.eventsByDay[day] : [];
  const dayEventIds = new Set(dayEvents.map(event => safeText(event?.id)).filter(Boolean));
  const dayRefs = new Set(dayEvents.flatMap(routeReferenceValuesV105));
  const scope = activeRouteScopeV105(state);
  const hasScope = !!scope.guideId || scope.refs.size > 0 || dayRefs.size > 0;

  return all
    .filter(leg => !hiddenRouteStatusV105(leg.status))
    .filter(leg => {
      if (leg.day === day || leg.pickupDay === day || leg.deliveryDay === day) return true;
      const startedBefore = String(leg.pickupDay || leg.day || '') < String(day || '');
      if (!startedBefore || closedCarryStatusV105(leg.status)) return false;
      if (dayEventIds.has(safeText(leg.pickupEventId)) || dayEventIds.has(safeText(leg.deliveryEventId))) return true;
      if (!hasScope) return true;
      if (scope.guideId && safeText(leg.loadGroupId) === scope.guideId) return true;
      const refs = routeReferenceValuesV105(leg);
      return refs.some(value => scope.refs.has(value) || dayRefs.has(value));
    })
    .sort((a, b) => String(a.pickupDay || a.day).localeCompare(String(b.pickupDay || b.day)) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999));
}

function primaryMilesDayForLeg`);
}
write(routePath, route);

const signingPath = 'source/src/modules/logbook/signing.js';
let signing = read(signingPath);
signing = replaceOnce(
  signing,
  `  if (severity === 'notice' || severity === 'review') return false;
  if (/active_day|location_jump|duplicate_shipping_docs|pretrip_after_driving|inspection_unlinked|inspection_complete_unlinked/.test(code)) return false;
  return severity === 'fix' || severity === 'violation' || severity === 'dot';`,
  `  if (severity === 'notice' || severity === 'review' || severity === 'violation') return false;
  if (/active_day|location_jump|duplicate_shipping_docs|pretrip_after_driving|inspection_unlinked|inspection_complete_unlinked/.test(code)) return false;
  return severity === 'fix' || severity === 'dot';`,
  'nonfatal HOS review'
);
signing = replaceOnce(
  signing,
  `  const fixRequired = dayIssues.filter(issue => isFatalSigningIssue(issue) && issueSeverity(issue) === 'fix');
  const hosViolations = dayIssues.filter(issue => isFatalSigningIssue(issue) && issueSeverity(issue) === 'violation');
  const notices = dayIssues.filter(issue => issueSeverity(issue) === 'notice');
  const review = dayIssues.filter(issue => issueSeverity(issue) === 'review');
  const ready = fixRequired.length === 0 && hosViolations.length === 0;
  const status = ready && review.length === 0 && dotPackage.length === 0 ? 'READY' : fixRequired.length || hosViolations.length ? 'FIX_REQUIRED' : 'REVIEW';`,
  `  const fixRequired = dayIssues.filter(issue => isFatalSigningIssue(issue) && issueSeverity(issue) === 'fix');
  const hosViolations = dayIssues.filter(issue => issueSeverity(issue) === 'violation');
  const notices = dayIssues.filter(issue => issueSeverity(issue) === 'notice');
  const review = dayIssues.filter(issue => issueSeverity(issue) === 'review');
  const ready = fixRequired.length === 0;
  const status = ready && review.length === 0 && hosViolations.length === 0 && dotPackage.length === 0 ? 'READY' : fixRequired.length ? 'FIX_REQUIRED' : 'REVIEW';`,
  'SignGuard HOS grouping'
);
write(signingPath, signing);

const dayPath = 'source/src/modules/logbook/DayLogScreen.jsx';
let dayScreen = read(dayPath);
dayScreen = replaceOnce(
  dayScreen,
  `import { buildChatGptLogReviewPrompt, buildIssueFixPrompt, buildSignGuardSummary, issueSuggestedAction, logSignState, signingWarnings, validateLogForSigning } from './signing.js';`,
  `import { buildChatGptLogReviewPrompt, buildIssueFixPrompt, buildSignGuardSummary, isFatalSigningIssue, issueSuggestedAction, logSignState, signingWarnings, validateLogForSigning } from './signing.js';`,
  'DayLog fatal issue import'
);
dayScreen = replaceOnce(
  dayScreen,
  `  const fixBlockers = blockers.filter(issue => !/active_day/i.test(String(issue.code || '')));`,
  `  const fixBlockers = blockers.filter(isFatalSigningIssue);`,
  'Sign button fatal issue filter'
);
write(dayPath, dayScreen);

console.log('v100.5 route and signing patch applied');
