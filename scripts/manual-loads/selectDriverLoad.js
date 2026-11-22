import {closedLoad, loadKey} from '../owneros/manualLoadCore.js';
import {currentHomeLoad, cleanRoutePlace} from '../home/currentHomeLoadV110369.js';
import {collectShipmentScanCandidates} from '../scan/shipmentFiling.js';

const number = load => String(load?.canonicalLoadNo || load?.loadNo || load?.load_no || '').trim();
const unavailable = row => row.deleted || row.deletedAt || row.excludedFromActiveLoad ||
  row.shipmentFiling || row.shipmentAmbiguous || row.identityReviewV110326 || row.brokerIdentityConflict;

function fromFolder(folder, state, at, evidence) {
  const loadNo = number(folder);
  if (evidence?.identity === 'load' && loadKey(evidence.loadNo) === loadKey(loadNo)) return evidence;
  // A manual folder may have acquired a rate confirmation after being created.
  // Reuse the guide authority check; never borrow another trip's stops.
  const guides = Object.values(state.loadGuidesById || {}).filter(guide =>
    loadKey(guide.loadNo || guide.orderNo) === loadKey(loadNo));
  const planned = guides.length === 1 ? currentHomeLoad({}, guides[0], at) : null;
  return {
    ...planned, guide: planned?.guide || null, loadNo, canonicalLoadNo: loadNo,
    recordId: folder.id || '', identity: 'load', recorded: false, shipmentReference: '',
    origin: planned?.origin || cleanRoutePlace(folder.origin),
    destination: planned?.destination || cleanRoutePlace(folder.destination),
    broker: folder.broker || planned?.guide?.broker || '', gross: folder.gross ?? planned?.guide?.rate ?? '',
    loadedMiles: folder.loadedMiles ?? planned?.guide?.miles ?? '',
  };
}

// Inputs are snapshots. Choosing a display/filing context never writes to a
// guide, the business store, a duty event or a day form.
export function selectDriverLoad(state, store, at, statuses, evidence, aliases) {
  const rows = store.loads || [];
  const byNumber = new Map();
  for (const row of rows) {
    const key = loadKey(number(row));
    if (key) byNumber.set(key, (byNumber.get(key) || 0) + 1);
  }
  const open = rows.filter(row => {
    const no = number(row), key = loadKey(no), status = statuses[no.toUpperCase()];
    return key && byNumber.get(key) === 1 && !unavailable(row) && !closedLoad(row) &&
      !closedLoad({status}) && (!aliases[no.toUpperCase()] || loadKey(aliases[no.toUpperCase()]) === key);
  });
  const eligible = new Set(open.map(row => loadKey(number(row))));
  const pinned = open.filter(row => row.manualActive === true);
  if (pinned.length > 1) return null;
  if (pinned.length === 1) return fromFolder(pinned[0], state, at, evidence);

  const evidenceKey = loadKey(evidence?.loadNo);
  const usable = byNumber.has(evidenceKey) && !eligible.has(evidenceKey)
    ? null : evidence;
  if (usable?.recorded) return usable;

  // Older trips can have a confirmed pickup with no route leg. Use the same
  // reviewed shipment records as Scan; keep their BOL identity distinct.
  if (Object.keys(state.eventsByDay || {}).length) {
    const shipments = collectShipmentScanCandidates(state, store, at)
      .filter(row => row.shipmentFiling && !row.shipmentAmbiguous && !closedLoad(row))
      .sort((a, b) => b.latestPickupAt - a.latestPickupAt);
    const shipment = shipments[0];
    if (shipment && (!shipments[1] || shipment.latestPickupAt > shipments[1].latestPickupAt)) {
      const canonical = aliases[shipment.shipmentReference.toUpperCase()];
      const folder = canonical && open.find(row => loadKey(number(row)) === loadKey(canonical));
      if (folder) return {...fromFolder(folder, state, at, usable), recorded: true, shipmentReference: shipment.shipmentReference};
      if (!canonical) return {
        loadNo: shipment.loadNo, identity: 'reference', shipmentReference: shipment.shipmentReference,
        canonicalLoadNo: '', guide: null, recorded: true, origin: shipment.origin, destination: shipment.destination,
      };
    }
  }
  if (usable) {
    const selectedGuide = usable.guide && usable.guide.id === state.activeLoadGuideId;
    const selectedForm = loadKey(state.loadInfo?.canonicalLoadNo || state.loadInfo?.loadNo || state.loadInfo?.shippingDocs);
    // getActiveLoadGuide may return the most recently updated guide when
    // nothing was selected. Sorting is not a driver's choice between jobs.
    if (usable.guide && !selectedGuide && selectedForm !== evidenceKey) {
      const choices = new Set(eligible);
      for (const guide of Object.values(state.loadGuidesById || {})) {
        const no = guide.loadNo || guide.orderNo || '';
        if (no && !unavailable(guide) && !closedLoad(guide) && !closedLoad({status: statuses[no.toUpperCase()]})) {
          choices.add(loadKey(no));
        }
      }
      if (choices.size > 1) return null;
    }
    return usable;
  }
  return open.length === 1 ? fromFolder(open[0], state, at, null) : null;
}
