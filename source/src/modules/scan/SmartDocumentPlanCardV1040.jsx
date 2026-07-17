import React from 'react';

function percent(value = 0) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value || 0))) * 100)}%`;
}

export default function SmartDocumentPlanCardV1040({ plan }) {
  if (!plan) return null;
  const stacks = Array.isArray(plan?.routing?.stacks) ? plan.routing.stacks : [];
  const review = Array.isArray(plan?.reviewFields) ? plan.reviewFields : [];
  const packet = plan?.packet || {};
  const match = plan?.match || {};
  return (
    <section className={`smart-plan-v1040 ${plan.requiresReview ? 'review' : 'verified'}`} data-testid="smart-document-plan-v1040">
      <div className="smart-plan-head-v1040">
        <div>
          <span>SMART FILE PLAN</span>
          <b>{plan?.exactType?.label || 'Document'}</b>
          <em>{percent(plan?.exactType?.confidence)} document match · Engine {plan.version}</em>
        </div>
        <strong>{plan.canAutoFile ? 'READY' : 'REVIEW'}</strong>
      </div>

      {packet.isPacket ? (
        <div className="smart-packet-v1040">
          <b>{packet.documentCount} documents found in {packet.pageCount} pages</b>
          <div>{(packet.documents || []).slice(0, 6).map(document => (
            <span key={document.id}>{document.pageRange} · {document.type?.label}</span>
          ))}</div>
        </div>
      ) : null}

      {match.score > 0 ? (
        <div className={`smart-load-match-v1040 ${match.matched ? 'matched' : ''}`}>
          <span>LOAD MATCH</span>
          <b>{match.loadNo || 'Unmatched'} · {match.score}/100</b>
          <em>{match.reasons?.join(' · ') || 'Confirm the load before save'}</em>
        </div>
      ) : null}

      <div className="smart-stack-title-v1040"><span>Filed everywhere it belongs</span><em>{stacks.length} linked stacks</em></div>
      <div className="smart-stacks-v1040">
        {stacks.slice(0, 8).map(stack => (
          <div key={`${stack.id}-${stack.path}`} className={stack.primary ? 'primary' : ''}>
            <b>{stack.label}</b>
            <span>{stack.path}</span>
          </div>
        ))}
      </div>

      {plan?.routing?.actions?.length ? (
        <div className="smart-actions-v1040">
          {(plan.routing.actions || []).slice(0, 5).map(action => <span key={action.id}>✓ {action.label}</span>)}
        </div>
      ) : null}

      {review.length ? (
        <div className="smart-review-v1040">
          <b>Check before filing</b>
          {review.slice(0, 5).map((item, index) => <span key={`${item.field}-${index}`}>{item.field}: {item.reason}</span>)}
        </div>
      ) : (
        <div className="smart-verified-v1040">Critical fields and routing are verified.</div>
      )}
    </section>
  );
}
