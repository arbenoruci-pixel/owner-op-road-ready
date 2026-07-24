import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeRateConRiskV10970 } from '../source/src/modules/scan/rateConRiskReviewV10970.js';

const fixture=`PAGE 1 OF 4 DHL Tire Load Driver Standard Operating Procedure. Drivers are required to download and set up the DHL Mobile Fleet App and FourKites Tracking prior to arrival. Submit Bills of Lading and complete a pre-trip inspection form at time of pickup. Drivers must remain on site until their Red Lightning Point of Contact confirms approval to depart. Drivers are required to complete both a pre-trip inspection at pickup and a post-trip inspection at delivery. PAGE 3 OF 4 Failure to complete pre trip and post trip inspections at time of pickup and delivery will result in a $100 administrative charge for each missing inspection. All administrative charges can and will be deducted from this rate confirmation.`;
const review=analyzeRateConRiskV10970({text:fixture});
assert.equal(review.blocking,true);
for(const id of ['pretrip','posttrip','inspection-penalty','direct-deduction','missing-inspection-link','departure-approval','dhl-app','fourkites']) assert.ok(review.items.some(item=>item.id===id),`missing risk ${id}`);
assert.equal(review.items.find(item=>item.id==='inspection-penalty').amount,100);
assert.equal(review.inspectionLinkPresent,false);

const screen=fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx','utf8');
for(const token of ['MANDATORY RISK AND DEDUCTION REVIEW','riskAcknowledged','riskBlocked','Booking is blocked until the Risk and Deduction Review is acknowledged']) assert.ok(screen.includes(token),`missing UI ${token}`);
assert.ok(screen.includes("selectedType === 'rate_confirmation'"));
assert.ok(screen.includes("analyzeRateConRiskV10970(analysis || {})"));
console.log('PASS — v109.7.0 catches Red Lightning $100 inspection deductions, missing link, apps, tracking and departure approval');
