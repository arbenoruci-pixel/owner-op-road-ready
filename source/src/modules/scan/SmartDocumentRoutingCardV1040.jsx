import React from 'react';
import { truckDocumentFamilyV1040 } from './truckDocumentCatalogV1040.js';

function pct(value = 0) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function entityRows(entities = {}) {
  return Object.values(entities || {}).filter(Boolean);
}

export default function SmartDocumentRoutingCardV1040({ analysis = {} }) {
  const routing = analysis.routing || {};
  const stacks = Array.isArray(routing.stacks) ? routing.stacks : [];
  const family = truckDocumentFamilyV1040(analysis.type?.family || 'other');
  const entities = entityRows(analysis.matchedEntities);
  const missing = Array.isArray(analysis.validation?.missingFields) ? analysis.validation.missingFields : [];
  const failed = (analysis.validation?.checks || []).filter(check => !check.ok).slice(0, 4);
  const packet = analysis.packet || {};
  const actions = Array.isArray(analysis.actions) ? analysis.actions.slice(0, 5) : [];

  return (
    <section className={`document-brain-v1040 ${routing.autoFile ? 'verified' : 'review'}`}>
      <div className="document-brain-head-v1040">
        <div>
          <span className="document-brain-kicker-v1040">TRUCK DOCUMENT BRAIN</span>
          <b>{family.icon} {family.label}</b>
          <em>{routing.autoFile ? 'Filing plan verified' : 'Filing plan ready for confirmation'} · {pct(routing.routeConfidence)}</em>
        </div>
        <span className="document-brain-status-v1040">{routing.autoFile ? 'AUTO-FILE READY' : 'REVIEW'}</span>
      </div>

      <div className="document-brain-primary-v1040">
        <span>Primary destination</span>
        <b>{routing.primary?.label || 'Smart Inbox'}</b>
        <em>{routing.primary?.entityLabel || routing.primary?.reason || 'The original file remains available in Documents.'}</em>
      </div>

      {stacks.length > 0 && <div className="document-brain-stacks-v1040">
        {stacks.map(stack => <span key={stack.id} className={stack.primary ? 'primary' : ''}>{stack.primary ? '✓ ' : ''}{stack.short || stack.label}</span>)}
      </div>}

      {entities.length > 0 && <div className="document-brain-entities-v1040">
        {entities.map(entity => <div key={`${entity.id}-${entity.label}`}><span>Matched</span><b>{entity.label}</b><em>{pct(entity.confidence)}</em></div>)}
      </div>}

      {packet.isMixed && <div className="document-brain-packet-v1040">
        <b>Mixed packet detected · {packet.pageCount} pages</b>
        <p>The upload contains multiple trucking documents. The original packet stays together and each page group receives its own filing stacks.</p>
        <div>{packet.segments.map(segment => <span key={`${segment.startPage}-${segment.type.id}`}>P{segment.startPage}{segment.endPage > segment.startPage ? `–${segment.endPage}` : ''} · {segment.type.short}</span>)}</div>
      </div>}

      {(missing.length > 0 || failed.length > 0) && <div className="document-brain-review-v1040">
        <b>Confirm before filing</b>
        {missing.length > 0 && <p>Missing: {missing.join(', ')}</p>}
        {failed.map(check => <p key={check.id}>{check.detail}</p>)}
      </div>}

      {actions.length > 0 && <div className="document-brain-actions-v1040">
        <b>After save</b>
        {actions.map(action => <div key={action.id}><span>→</span><p><strong>{action.label}</strong><em>{action.detail}</em></p></div>)}
      </div>}

      <p className="document-brain-safety-v1040">Logbook links stay suggestions. No duty status, certified log, signature, invoice or payment is changed without driver confirmation.</p>
    </section>
  );
}
