import { driverLogbookEntries } from '../../source/src/core/team/teamLogbook.js';

const rows = map => Object.values(map || {}).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
const records = map => Object.values(map || {}).filter(value => value != null && (typeof value !== 'object' || Object.keys(value).length)).length;
const count = (map, predicate) => Object.values(map || {}).filter(predicate).length;

// Pure inventory shared by the display, export summary and import safety gate.
export function recordedDeviceInventory(state = {}, business = {}) {
  const books = driverLogbookEntries(state).map(([, book]) => book);
  const days = [...new Set([state, ...books].flatMap(book => [
    'eventsByDay','signatureByDay','inspectionByDay','formByDay','certifyStatus',
    'routeLegsByDay','documentsByDay','fuelReceiptsByDay','manualMilesByDay',
  ].flatMap(field => Object.keys(book[field] || {}))))].filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  const sum = fn => books.reduce((total, book) => total + fn(book), 0);
  const businessCounts = Object.fromEntries(['loads','documents','fuel','maintenance','expenses','settlements'].map(bucket => [bucket, Array.isArray(business[bucket]) ? business[bucket].length : 0]));
  return {
    firstDay:days[0] || null, lastDay:days.at(-1) || null, logDays:days.length,
    driverCount:books.length,
    eventDays:sum(book => count(book.eventsByDay, value => Array.isArray(value) && value.length > 0)),
    events:sum(book => rows(book.eventsByDay)),
    signedLogs:sum(book => count(book.signatureByDay, row => row?.signed || row?.signatureRef || row?.signatureDataUrl)),
    inspections:sum(book => count(book.inspectionByDay, row => row?.complete || row?.status === 'complete')),
    driverRecords:sum(book => records(book.signatureByDay) + records(book.inspectionByDay) + records(book.formByDay) + records(book.dutySafetyBackupByDay) + (book.driverSignature ? 1 : 0)),
    routeLegs:rows(state.routeLegsByDay),
    walletDocuments:count(state.dotWallet?.documents, row => row?.present || row?.attachmentDataUrl || row?.clientDocumentId),
    logDocuments:rows(state.documentsByDay), fuelReceipts:rows(state.fuelReceiptsByDay),
    loadGuides:Object.keys(state.loadGuidesById || {}).length,
    manualMileageRecords:records(state.manualMilesByDay),
    businessLoads:businessCounts.loads, businessDocuments:businessCounts.documents,
    businessFuel:businessCounts.fuel, businessMaintenance:businessCounts.maintenance,
    businessExpenses:businessCounts.expenses, businessSettlements:businessCounts.settlements,
    businessRecords:Object.values(businessCounts).reduce((total, value) => total + value, 0),
  };
}

export function hasMeaningfulDeviceData(inventory) {
  if (!inventory || inventory.complete !== true) return true; // Unknown is never a fresh device.
  return ['events','signedLogs','inspections','driverRecords','routeLegs','walletDocuments',
    'logDocuments','fuelReceipts','loadGuides','manualMileageRecords','businessRecords',
    'businessLoads','businessDocuments','businessFuel','businessMaintenance','businessExpenses',
    'businessSettlements','documentBlobRows','databaseRecords'].some(key => Number(inventory[key] || 0) > 0);
}

export function assertSafeDeviceImport(inventory, verifiedSafety) {
  if (!inventory || inventory.complete !== true) throw new Error('Import stopped: this device could not be checked. Try Scan again. No data was replaced.');
  if (hasMeaningfulDeviceData(inventory) && !verifiedSafety) {
    throw new Error('This device already has Road Ready data. Create and save a verified Device Safety Backup here before importing another device.');
  }
}
