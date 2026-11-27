import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {buildPodInvoiceDraft,brokerGross} from '../../app/operator/podInvoicePdf.js';

register(new URL('../test-jsx-loader.mjs',import.meta.url));
register(new URL('./step3.css-loader.mjs',import.meta.url));
globalThis.React = React;
const {PodInvoiceDrafts} = await import('../../app/operator/PodInvoiceDrafts.jsx');
const base = {
  draft_id:'test-reference',load_id:'test-load',load_number:'RR-POD-TEST-042',broker_name:'Demo Freight',
  driver_name:'Test Driver',pickup_address:'Rockford, IL',delivery_address:'Elkhart, IN',gross_cents:320000,
  status:'pending_review',deliveries:{total:2,covered:[],missing:[1,2]},notifications:[{
    document_id:'original',file_name:'receipt.pdf',status:'accepted',review_status:'PENDING',
  }],blocking_reasons:['Missing POD for delivery 2 of 2'],
};

async function pdfText(row,options) {
  const bytes = await buildPodInvoiceDraft(row,options);
  const task = getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true});
  try {
    const doc = await task.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(x => x.str).join(' '));
    }
    return pages.join('\n');
  } finally {await task.destroy();}
}

test('actual test invoice PDF carries verified broker gross, matching load and distinct staging watermark',async () => {
  const text = await pdfText(base,{preview:true});
  for (const value of ['NARTA EXPRESS LLC','Freight invoice draft','Fictional staging example','Demo Freight',
    'RR-POD-TEST-042','Rockford, IL','Elkhart, IN','test-reference','$3,200.00']) assert.ok(text.includes(value),value);
  assert.match(text,/TEST\s*\/\s*DRAFT/);
  assert.doesNotMatch(text,/settlement|reimbursements|2,794|256\.00/i);
});

test('pending/unverified rate stays unknown in PDF; issued/corrected packets cannot be regenerated as drafts',async () => {
  assert.equal(brokerGross('320000'),'$3,200.00');
  for (const missing of [null,'',NaN,undefined,0,-1,0.2]) assert.equal(brokerGross(missing),'Pending rate verification');
  const text = await pdfText({...base,gross_cents:null});
  assert.match(text,/Pending rate verification/);
  assert.doesNotMatch(text,/\$0\.00|Fictional staging example/);
  for (const status of ['factoring_recorded','correction_review']) {
    await assert.rejects(buildPodInvoiceDraft({...base,status}),/current invoice draft/);
  }
});

function html(row,props = {}) {
  return renderToStaticMarkup(React.createElement(PodInvoiceDrafts,{
    drafts:[row],onOpenOriginal:async () => new Blob(),renderReview:() => React.createElement('button',{},'Record office decision'),...props,
  }));
}

test('office identifies pending evidence, missing stop, wrong-load decision and Graph acceptance without delivery claim',() => {
  const body = html(base);
  for (const phrase of ['View draft invoice','$3,200.00','Missing POD for delivery 2 of 2','Review this POD',
    'Record office decision','View POD original','Accepted by Outlook','wrong-load POD']) assert.ok(body.includes(phrase),phrase);
  assert.doesNotMatch(body,/Delivered by Outlook/);
});

test('frozen packets expose addendum and exception without a draft or any recipient-send control',() => {
  const body = html({...base,status:'correction_review',notifications:[{...base.notifications[0],status:'review',addendum:true}]});
  for (const label of ['Correction needs office review','Post-billing correction','View POD original','Check Hotmail before retrying'])
    assert.ok(body.includes(label),label);
  assert.doesNotMatch(body,/View draft invoice|Record office decision|>Send/);
});

test('ambiguous notice resolution requires provider or mailbox proof and only appears for review notices',() => {
  const controls = {onResolveMail:async () => true};
  const uncertain = html({...base,notifications:[{...base.notifications[0],status:'review'}]},controls);
  for (const part of ['Resolve Hotmail notification','RR-POD-original','Receipt confirmed in Hotmail','Provider confirmed non-acceptance',
    'Mailbox or provider evidence reference','minLength="5"']) assert.ok(uncertain.toLowerCase().includes(part.toLowerCase()),part);
  assert.doesNotMatch(html(base,controls),/Resolve Hotmail notification/);
});
