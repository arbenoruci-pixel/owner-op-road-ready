'use client';

import { getOwnerOpDb } from '../../../../lib/local-db/dexie.js';
import { getScannedDocumentBlob } from './scanStorage.js';

export const CAPTURE_ASSET_STORE_VERSION_V106 = '106.0.0';

function uuidV106(prefix = 'capture_asset') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function textV106(value = '') {
  return String(value || '').trim();
}

function assetVariantV106(asset = {}) {
  return {
    kind:textV106(asset.kind || 'capture-variant'),
    pageIndex:Math.max(0, Number(asset.pageIndex || 0)),
    immutable:Boolean(asset.immutable),
    hash:textV106(asset.hash),
    geometryMode:textV106(asset.geometryMode),
    filter:textV106(asset.filter),
    createdAt:textV106(asset.createdAt) || new Date().toISOString(),
  };
}

export function groupCaptureAssetsV106(assets = []) {
  const byFile = new Map();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const file = asset?.file;
    if (!file || typeof file !== 'object') continue;
    const variant = assetVariantV106(asset);
    let group = byFile.get(file);
    if (!group) {
      group = {
        file,
        variants:[],
        name:textV106(file.name),
        mimeType:textV106(file.type) || 'application/octet-stream',
        size:Number(file.size || 0),
      };
      byFile.set(file, group);
    }
    if (!group.variants.some(item => item.kind === variant.kind && item.pageIndex === variant.pageIndex)) group.variants.push(variant);
  }
  return [...byFile.values()].map(group => ({
    ...group,
    variants:[...group.variants].sort((left, right) => left.pageIndex - right.pageIndex || left.kind.localeCompare(right.kind)),
  }));
}

function descriptorV106(row = {}) {
  return {
    localAssetId:row.local_asset_id,
    runId:row.capture_run_id,
    variants:row.variants || [],
    fileName:row.file_name || '',
    mimeType:row.mime_type || '',
    fileSizeBytes:Number(row.file_size_bytes || 0),
    createdAt:row.created_at || '',
    current:row.current !== false,
  };
}

export async function persistCaptureAssetsV106({
  clientDocumentId = '',
  assets = [],
  captureManifest = null,
  scannerVersion = CAPTURE_ASSET_STORE_VERSION_V106,
} = {}) {
  const documentId = textV106(clientDocumentId);
  const groups = groupCaptureAssetsV106(assets);
  const runId = uuidV106('capture_run');
  const createdAt = new Date().toISOString();
  const rows = groups.map(group => ({
    local_asset_id:uuidV106('capture_asset'),
    client_document_id:documentId,
    capture_run_id:runId,
    current:true,
    variants:group.variants,
    variant_kind:group.variants[0]?.kind || 'capture-variant',
    page_index:Number(group.variants[0]?.pageIndex || 0),
    blob:group.file,
    file_name:group.name,
    mime_type:group.mimeType,
    file_size_bytes:group.size,
    scanner_version:textV106(scannerVersion) || CAPTURE_ASSET_STORE_VERSION_V106,
    created_at:createdAt,
  }));
  const descriptors = rows.map(descriptorV106);
  const db = getOwnerOpDb();
  if (!documentId || !db?.capture_asset_blobs) {
    return { status:'unavailable', runId, assets:descriptors, captureManifest, stored:0 };
  }

  try {
    await db.transaction('rw', db.capture_asset_blobs, db.documents_local, async () => {
      await db.capture_asset_blobs.where('client_document_id').equals(documentId).modify({ current:false });
      if (rows.length) await db.capture_asset_blobs.bulkPut(rows);
      const prior = await db.documents_local.where('client_document_id').equals(documentId).first();
      const priorRuns = Array.isArray(prior?.capture_runs) ? prior.capture_runs : [];
      await db.documents_local.where('client_document_id').equals(documentId).modify({
        capture_manifest:captureManifest || null,
        capture_run_id:runId,
        capture_assets:descriptors,
        capture_asset_count:descriptors.length,
        capture_runs:[
          ...priorRuns.map(run => ({ ...run, current:false })),
          { runId, current:true, scannerVersion, createdAt, assetCount:descriptors.length },
        ].slice(-8),
        updated_at:createdAt,
      });
    });
    return { status:'stored', runId, assets:descriptors, captureManifest, stored:rows.length };
  } catch (error) {
    return {
      status:'original-only',
      runId,
      assets:[],
      captureManifest,
      stored:0,
      error:String(error?.message || error),
    };
  }
}

async function captureRowsV106(clientDocumentId = '', options = {}) {
  const db = getOwnerOpDb();
  if (!db?.capture_asset_blobs || !clientDocumentId) return [];
  const rows = await db.capture_asset_blobs.where('client_document_id').equals(clientDocumentId).toArray();
  const currentRows = rows.filter(row => row.current !== false);
  const source = options.runId
    ? rows.filter(row => row.capture_run_id === options.runId)
    : (currentRows.length ? currentRows : rows);
  return source.sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
}

function rowHasVariantV106(row = {}, kind = '', pageIndex = 0) {
  const variants = Array.isArray(row.variants) ? row.variants : [];
  return variants.some(variant => variant.kind === kind && Number(variant.pageIndex || 0) === Number(pageIndex || 0));
}

export async function getCaptureAssetBlobV106(clientDocumentId = '', kind = 'original', pageIndex = 0, options = {}) {
  const rows = await captureRowsV106(clientDocumentId, options);
  const row = rows.find(item => rowHasVariantV106(item, kind, pageIndex));
  if (row?.blob) return row.blob;
  if (kind === 'original') return getScannedDocumentBlob(clientDocumentId);
  return null;
}

export async function getBestCleanedCaptureBlobV106(clientDocumentId = '', pageIndex = 0, options = {}) {
  for (const kind of ['ocr-selected','enhanced-color','dewarped','perspective-corrected','user-adjusted-crop','automatic-crop']) {
    const blob = await getCaptureAssetBlobV106(clientDocumentId, kind, pageIndex, options);
    if (blob) return { kind, blob };
  }
  return null;
}

export async function listCaptureAssetsV106(clientDocumentId = '', options = {}) {
  return (await captureRowsV106(clientDocumentId, options)).map(descriptorV106);
}

export async function restoreCaptureRunV106(clientDocumentId = '', runId = '') {
  const db = getOwnerOpDb();
  if (!db?.capture_asset_blobs || !clientDocumentId || !runId) return false;
  const rows = await db.capture_asset_blobs.where('client_document_id').equals(clientDocumentId).toArray();
  if (!rows.some(row => row.capture_run_id === runId)) return false;
  await db.transaction('rw', db.capture_asset_blobs, db.documents_local, async () => {
    for (const row of rows) {
      await db.capture_asset_blobs.update(row.local_asset_id, { current:row.capture_run_id === runId });
    }
    const selected = rows.filter(row => row.capture_run_id === runId).map(descriptorV106);
    const document = await db.documents_local.where('client_document_id').equals(clientDocumentId).first();
    await db.documents_local.where('client_document_id').equals(clientDocumentId).modify({
      capture_run_id:runId,
      capture_assets:selected,
      capture_asset_count:selected.length,
      capture_runs:(document?.capture_runs || []).map(run => ({ ...run, current:run.runId === runId })),
      updated_at:new Date().toISOString(),
    });
  });
  return true;
}
