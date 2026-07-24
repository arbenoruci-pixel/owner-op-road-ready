import fs from 'node:fs';

const SCREEN='source/src/modules/scan/SmartScanSheetV105.jsx';
const CSS='source/src/road-ready-2026.css';
function read(p){ return fs.readFileSync(p,'utf8'); }
function write(p,v){ fs.writeFileSync(p,v); }
function required(src,before,after,label){
  if(src.includes(after)) return src;
  if(!src.includes(before)) throw new Error(`v109.7.0 missing ${label}`);
  return src.replace(before,after);
}

let screen=read(SCREEN);
screen=required(screen,
"} from '../documents/documentFoundationV105.js';",
"} from '../documents/documentFoundationV105.js';\nimport { analyzeRateConRiskV10970 } from './rateConRiskReviewV10970.js';",
'risk engine import');
screen=required(screen,
"  const [reviewed, setReviewed] = useState(false);",
"  const [reviewed, setReviewed] = useState(false);\n  const [riskAcknowledged, setRiskAcknowledged] = useState(false);",
'risk acknowledgement state');
screen=required(screen,
"    setReviewed(false);\n    setDetailsOpen(false);",
"    setReviewed(false);\n    setRiskAcknowledged(false);\n    setDetailsOpen(false);",
'reset risk acknowledgement');
screen=required(screen,
"  const needsReview = Boolean(analysis?.needsReview || confidence < .85 || !selectedType || requiresLoad && !selectedLoadNo || !documentDate);\n  const canSave = Boolean(file && selectedType && (!needsReview || reviewed));",
"  const needsReview = Boolean(analysis?.needsReview || confidence < .85 || !selectedType || requiresLoad && !selectedLoadNo || !documentDate);\n  const riskReview = useMemo(() => selectedType === 'rate_confirmation' ? analyzeRateConRiskV10970(analysis || {}) : null, [selectedType, analysis]);\n  const riskBlocked = Boolean(riskReview?.blocking && !riskAcknowledged);\n  const canSave = Boolean(file && selectedType && (!needsReview || reviewed) && !riskBlocked);",
'mandatory risk gate');
screen=required(screen,
"    setReviewed(false);\n    setStage('confirm');",
"    setReviewed(false);\n    setRiskAcknowledged(false);\n    setStage('confirm');",
'new analysis acknowledgement reset');
screen=required(screen,
"        <section className=\"scan-details-v105\">",
"        {selectedType === 'rate_confirmation' && riskReview ? <section className={`ratecon-risk-review-v10970 ${riskReview.blocking ? 'critical' : 'clear'}`}>\n          <header><span><Icon name=\"alert\" size={22}/></span><div><em>MANDATORY RISK AND DEDUCTION REVIEW</em><h2>{riskReview.blocking ? 'Financial and compliance risks found' : 'No critical deductions detected'}</h2><p>Every extracted page was checked for inspections, deductions, chargebacks, tracking, required apps, payment fees and departure restrictions.</p></div></header>\n          {riskReview.items.length ? <div className=\"ratecon-risk-list-v10970\">{riskReview.items.map(item => <article key={item.id} className={item.severity}><i>{item.severity === 'critical' ? '!' : '•'}</i><div><b>{item.title}</b><span>{item.detail}</span></div></article>)}</div> : <p className=\"ratecon-risk-clear-v10970\">No critical risk language was detected. Review the original before accepting the load.</p>}\n          {riskReview.blocking ? <label className=\"ratecon-risk-ack-v10970\"><input type=\"checkbox\" checked={riskAcknowledged} onChange={event=>setRiskAcknowledged(event.target.checked)}/><span><b>I reviewed these risks and have the required links/apps</b><em>Saving or booking remains blocked until this is acknowledged.</em></span></label> : null}\n        </section> : null}\n\n        <section className=\"scan-details-v105\">",
'risk review UI');
screen=required(screen,
"        <button type=\"button\" className=\"scan-save-v105\" disabled={!canSave || stage === 'saving'} onClick={save}>",
"        {riskBlocked ? <p className=\"scan-message-v105 ratecon-risk-block-v10970\"><Icon name=\"alert\" size={17}/>Booking is blocked until the Risk and Deduction Review is acknowledged.</p> : null}\n        <button type=\"button\" className=\"scan-save-v105\" disabled={!canSave || stage === 'saving'} onClick={save}>",
'blocked save message');
write(SCREEN,screen);

let css=read(CSS);
if(!css.includes('.ratecon-risk-review-v10970')) css += `\n/* v109.7.0 mandatory Rate Con risk review */\n.ratecon-risk-review-v10970{margin:18px 0;padding:18px;border:2px solid #d9e3f2;border-radius:24px;background:#f8fbff;color:#0d1d34}.ratecon-risk-review-v10970.critical{border-color:#ffb7b7;background:#fff4f4}.ratecon-risk-review-v10970 header{display:flex;gap:13px;align-items:flex-start}.ratecon-risk-review-v10970 header>span{display:grid;place-items:center;min-width:42px;height:42px;border-radius:14px;background:#e8f1ff;color:#1f61e8}.ratecon-risk-review-v10970.critical header>span{background:#ffe0e0;color:#b42318}.ratecon-risk-review-v10970 header em{display:block;font-style:normal;font-size:11px;font-weight:900;letter-spacing:.15em;color:#b42318}.ratecon-risk-review-v10970 h2{margin:4px 0 5px;font-size:20px;line-height:1.1}.ratecon-risk-review-v10970 header p{margin:0;color:#67758b;font-weight:650;line-height:1.4}.ratecon-risk-list-v10970{display:grid;gap:10px;margin-top:16px}.ratecon-risk-list-v10970 article{display:flex;gap:11px;padding:13px;border-radius:16px;background:#fff;border:1px solid #dce5f0}.ratecon-risk-list-v10970 article.critical{border-color:#ffc7c7;background:#fff}.ratecon-risk-list-v10970 article.warning{border-color:#f3df9b;background:#fffaf0}.ratecon-risk-list-v10970 i{display:grid;place-items:center;flex:0 0 28px;height:28px;border-radius:9px;background:#dce8ff;color:#245edb;font-style:normal;font-weight:900}.ratecon-risk-list-v10970 article.critical i{background:#d92d20;color:#fff}.ratecon-risk-list-v10970 b,.ratecon-risk-list-v10970 span{display:block}.ratecon-risk-list-v10970 b{font-size:15px}.ratecon-risk-list-v10970 span{margin-top:3px;color:#667085;font-size:13px;line-height:1.35}.ratecon-risk-ack-v10970{display:flex;gap:12px;margin-top:16px;padding:14px;border-radius:16px;background:#17233a;color:#fff}.ratecon-risk-ack-v10970 input{width:22px;height:22px;flex:0 0 22px}.ratecon-risk-ack-v10970 b,.ratecon-risk-ack-v10970 em{display:block}.ratecon-risk-ack-v10970 em{margin-top:3px;color:#b7c3d6;font-style:normal;font-size:12px}.ratecon-risk-block-v10970{background:#fff0f0!important;color:#a31313!important;border-color:#ffb4b4!important}\n`;
write(CSS,css);
console.log('PASS — v109.7.0 mandatory Rate Confirmation Risk and Deduction Review applied');
