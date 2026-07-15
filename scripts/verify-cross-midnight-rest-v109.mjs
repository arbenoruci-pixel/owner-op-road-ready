import assert from 'node:assert/strict';

const hos = await import(`../source/src/core/hos/hosEngine.js?v109=${Date.now()}`);
const { analyzeLinkedHos, violationRangesForDay } = hos;

const completedAcrossMidnight = {
  '2000-01-01':[
    { id:'drive_before_rest', status:'D', startMin:900, endMin:1169, city:'Clearfield', state:'WI', note:'Driving started' },
    { id:'sb_evening', status:'SB', startMin:1169, endMin:1439, city:'Mounds View', state:'MN', note:'Sleeper Berth' },
  ],
  '2000-01-02':[
    { id:'sb_morning', status:'SB', startMin:0, endMin:573, city:'Mounds View', state:'MN', note:'Sleeper Berth' },
    { id:'on_after_reset', status:'ON', startMin:573, endMin:591, city:'Mounds View', state:'MN', note:'Delivery / Unloading' },
  ],
};

const completedRanges = violationRangesForDay(completedAcrossMidnight, '2000-01-01');
assert.equal(completedRanges.some(range => range.type === 'split7watch'), false, 'continued 14h sleeper must not show under-7h review');

const completedAnalysis = analyzeLinkedHos(completedAcrossMidnight, '2000-01-01', { '2000-01-01':'Needs signature' });
assert.equal(completedAnalysis.warnings.some(warning => /Sleeper under 7h/i.test(String(warning.text || ''))), false);
assert.equal(completedAnalysis.warnings.some(warning => /No valid 10h reset/i.test(String(warning.text || ''))), false);
assert.equal(completedAnalysis.cards.find(card => card.label === 'Reset')?.ok, true);
assert.equal(completedAnalysis.restProgress?.duration >= 843, true);

const genuinelyShortSleeper = {
  '2000-01-03':[
    { id:'drive_before_short', status:'D', startMin:900, endMin:1169, city:'Clearfield', state:'WI', note:'Driving started' },
    { id:'short_sb', status:'SB', startMin:1169, endMin:1439, city:'Mounds View', state:'MN', note:'Sleeper Berth' },
  ],
  '2000-01-04':[
    { id:'on_midnight', status:'ON', startMin:0, endMin:20, city:'Mounds View', state:'MN', note:'On Duty' },
  ],
};

const shortRanges = violationRangesForDay(genuinelyShortSleeper, '2000-01-03');
assert.equal(shortRanges.some(range => range.type === 'split7watch'), true, 'a sleeper block that really ends under 7h must still be reviewed');

console.log('verify-cross-midnight-rest-v109 passed');
