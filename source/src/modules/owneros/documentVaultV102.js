'use client';

import { getOwnerOpDb } from '../../../../lib/local-db/dexie.js';
import { getScannedDocumentBlob } from '../scan/scanStorage.js';

function text(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }

export function vaultDocumentTypeV102(document = {}) {
  return text(document.extracted?.type || document.classification?.selectedType || document.type || 'other').toLowerCase();
}

export function vaultDocumentLoadNoV102(document = {}) {
  return text(document.load_no || document.extracted?.loadNo || document.extracted?.orderNo || document.extracted?.bolNo || '').toUpperCase();
}

export function vaultDocumentDateV102(document = {}) {
  return text(document.extracted?.date || document.extracted?.pickupDate || document.created_at || '').slice(0, 10);
}

export function vaultDocumentLabelV102(document = {}) {
  const type = vaultDocumentTypeV102(document);
  const labels = {
    rate_confirmation:'Rate Confirmation', bol:'Bill of Lading', pod:'Proof of Delivery', fuel_receipt:'Fuel Receipt',
    repair_invoice:'Repair Invoice', carrier_settlement:'Carrier Settlement', lumper_receipt:'Lumper Receipt',
    scale_ticket:'Scale Ticket', toll_parking_receipt:'Toll / Parking', toll_statement:'Toll Statement',
    mileage_statement:'Mileage / IFTA', insurance:'Insurance', registration:'Registration', annual_inspection:'Annual Inspection',
  };
  return labels[type] || text(document.title || document.original_file_name || 'Document');
}

export async function listVaultDocumentsV102() {
  const db = getOwnerOpDb();
  if (!db?.documents_local) return [];
  try {
    const rows = await db.documents_local.toArray();
    return rows
      .filter(Boolean)
      .sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .map(document => ({
        ...document,
        vaultType:vaultDocumentTypeV102(document),
        vaultLabel:vaultDocumentLabelV102(document),
        vaultLoadNo:vaultDocumentLoadNoV102(document),
        vaultDate:vaultDocumentDateV102(document),
      }));
  } catch {
    return [];
  }
}

export async function vaultBlobV102(document = {}) {
  if (!document?.client_document_id) return null;
  return getScannedDocumentBlob(document.client_document_id);
}

export async function openVaultDocumentV102(document = {}) {
  const blob = await vaultBlobV102(document);
  if (!blob || typeof window === 'undefined') return { ok:false, reason:'blob_missing' };
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), opened ? 120_000 : 5_000);
  return { ok:!!opened, url };
}

export async function downloadVaultDocumentV102(doc = {}) {
  const blob = await vaultBlobV102(doc);
  if (!blob || typeof window === 'undefined') return false;
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = text(doc.original_file_name || doc.title || 'road-ready-document').replace(/[^a-zA-Z0-9._-]+/g,'-');
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function searchVaultDocumentsV102(documents = [], query = '', filters = {}) {
  const needle = text(query).toLowerCase();
  const typeFilter = text(filters.type).toLowerCase();
  const loadFilter = text(filters.loadNo).toUpperCase();
  return list(documents).filter(document => {
    const type = vaultDocumentTypeV102(document);
    const loadNo = vaultDocumentLoadNoV102(document);
    if (typeFilter && type !== typeFilter) return false;
    if (loadFilter && loadNo !== loadFilter) return false;
    if (!needle) return true;
    const haystack = [
      document.title, document.original_file_name, document.vaultLabel, type, loadNo,
      document.extracted?.broker, document.extracted?.merchant, document.extracted?.origin,
      document.extracted?.destination, document.extracted?.transactionId, document.extracted?.invoiceNo,
      document.extracted?.total, document.extracted?.date,
    ].map(text).join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

export function vaultManifestV102(documents = []) {
  return list(documents).map(document => ({
    id:document.local_id,
    title:document.title,
    type:vaultDocumentTypeV102(document),
    loadNo:vaultDocumentLoadNoV102(document),
    date:vaultDocumentDateV102(document),
    originalFileName:document.original_file_name,
    mimeType:document.mime_type,
    fileSizeBytes:Number(document.file_size_bytes || 0),
    syncState:document.sync_state,
    relationType:document.relation_type,
    confidence:Number(document.classification?.confidence || 0),
    createdAt:document.created_at,
    updatedAt:document.updated_at,
  }));
}
