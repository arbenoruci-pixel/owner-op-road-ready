import {truckDocumentTypeMetaV1040} from './truckDocumentCatalogV1040.js';

// Resume the reviewed document, including its chosen folder, without discarding
// its extraction and starting OCR again. Empty legacy scans still use the reader.
export function savedScanResultV110318(record = {}, local = {}) {
  const fields = {...(local.extracted || {}), ...(record.extracted || {})};
  const typeId = record.type || local.classification?.selectedType || fields.type;
  const identity = record.canonicalLoadNo || fields.loadNo || fields.orderNo || fields.bolNo || fields.poNumber || fields.instructionPlanV110311?.loadNo;
  if (!typeId || typeId === 'other' || !identity) return null;
  const text = fields.guideSourceTextV110312 || fields.instructionPlanV110311?.sourceText || fields.documentText || '';
  const type = truckDocumentTypeMetaV1040(typeId);
  return {type, detectedType:type, fields,
    text, confidence:Number(record.classification?.confidence || local.classification?.confidence || 0),
    method:record.classification?.method || 'saved-document', needsReview:true,
    resumedRecordV110318:{
      id:record.id, loadNo:record.canonicalLoadNo || '',
      date:record.documentDate || fields.documentDate || fields.date || '',
      assignment:record.loadAssignmentStatusV11037 || fields.loadAssignmentStatusV11037 || '',
      linkToLogbook:Boolean(record.linkToLogbook), linkDay:record.linkDay || '',
    },
  };
}
