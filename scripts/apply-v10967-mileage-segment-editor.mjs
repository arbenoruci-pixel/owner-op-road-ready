import fs from 'node:fs';

const file = 'source/src/modules/logbook/DayLogScreen.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes("import MileageSegmentEditor from './MileageSegmentEditor.jsx';")) {
  text = text.replace(
    "import LogCheckPanel from './LogCheckPanel.jsx';",
    "import LogCheckPanel from './LogCheckPanel.jsx';\nimport MileageSegmentEditor from './MileageSegmentEditor.jsx';"
  );
}

if (!text.includes('const [mileageEditorOpen, setMileageEditorOpen]')) {
  text = text.replace(
    "  const [missingDayIssue, setMissingDayIssue] = useState(null);",
    "  const [missingDayIssue, setMissingDayIssue] = useState(null);\n  const [mileageEditorOpen, setMileageEditorOpen] = useState(false);"
  );
}

const promptStart = text.indexOf("  function promptManualMilesForEvent(eventId = '') {");
const promptEnd = text.indexOf('  function handleDotOfficerIssue(issue = {}) {', promptStart);
if (promptStart < 0 || promptEnd < 0) throw new Error('Mileage prompt function anchor not found');

const replacement = [
  "  function promptManualMilesForEvent() {",
  "    const driving = displayEvents.some(event => event.status === 'D');",
  "    if (!driving) {",
  "      window.alert?.('No driving event found on this day.');",
  "      return;",
  "    }",
  "    setMileageEditorOpen(true);",
  "  }",
  "",
  "  function saveMileageSegments({ totalMiles, segments }) {",
  "    for (const segment of segments || []) {",
  "      for (const allocation of segment.allocations || []) {",
  "        const event = displayEvents.find(item => item.id === allocation.eventId);",
  "        if (!event) continue;",
  "        onSaveManualMiles?.(event.id, {",
  "          manualMiles: allocation.miles,",
  "          manualMilesByState: null,",
  "          manualMilesState: '',",
  "          manualMilesReviewedAt: Date.now(),",
  "          manualMilesSource: segment.source || 'daily segment editor',",
  "          manualMilesSuggestion: {",
  "            miles:segment.miles,",
  "            source:segment.source || 'daily segment editor',",
  "            confidence:segment.confidence || 'Driver reviewed',",
  "            from:segment.from?.label || null,",
  "            to:segment.to?.label || null,",
  "            dailyTotal:totalMiles,",
  "          },",
  "          description:event.description || ('Driving miles ' + allocation.miles.toFixed(2) + ' mi'),",
  "        });",
  "      }",
  "    }",
  "    setMileageEditorOpen(false);",
  "    window.alert?.('Saved ' + Number(totalMiles || 0).toFixed(2) + ' total driving miles.');",
  "  }",
  "",
  "",
].join('\n');
text = text.slice(0, promptStart) + replacement + text.slice(promptEnd);

if (!text.includes('<MileageSegmentEditor')) {
  text = text.replace(
    '      <CoverageFixWizard issue={coverageWizardIssue}',
    `      <MileageSegmentEditor
        open={mileageEditorOpen}
        events={displayEvents}
        routeLegs={routeLegsForDay(state, state.activeDay)}
        gpsPoints={state.gpsTrip?.points || []}
        onClose={() => setMileageEditorOpen(false)}
        onSave={saveMileageSegments}
      />
      <CoverageFixWizard issue={coverageWizardIssue}`
  );
}

fs.writeFileSync(file, text);

const cssFile = 'source/src/road-ready-2026.css';
let css = fs.readFileSync(cssFile, 'utf8');
if (!css.includes('/* v109.6.7 mileage segment editor */')) {
  css += `

/* v109.6.7 mileage segment editor */
.mileage-editor-overlay{position:fixed;inset:0;z-index:10050;background:rgba(2,8,15,.78);backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;padding:18px 12px calc(18px + env(safe-area-inset-bottom))}
.mileage-editor-card{width:min(680px,100%);max-height:88dvh;overflow:auto;border:1px solid rgba(148,163,184,.22);border-radius:26px;background:#0b131d;box-shadow:0 28px 80px rgba(0,0,0,.55);padding:20px;color:#f8fafc}
.mileage-editor-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.mileage-editor-head div{display:grid;gap:3px}.mileage-editor-head span{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#60a5fa}.mileage-editor-head b{font-size:22px}.mileage-editor-head button,.mileage-editor-actions .secondary{border:1px solid rgba(148,163,184,.26);background:#111c29;color:#cbd5e1}
.mileage-editor-help{color:#94a3b8;line-height:1.45;margin:14px 0 16px}.mileage-segment-list{display:grid;gap:10px}.mileage-segment-row{display:grid;grid-template-columns:32px minmax(0,1fr) 92px;align-items:center;gap:10px;padding:13px;border-radius:18px;border:1px solid rgba(96,165,250,.25);background:linear-gradient(135deg,rgba(37,99,235,.18),rgba(15,23,42,.78))}.mileage-segment-row.tone-1{border-color:rgba(34,197,94,.3);background:linear-gradient(135deg,rgba(22,163,74,.17),rgba(15,23,42,.78))}.mileage-segment-row.tone-2{border-color:rgba(245,158,11,.3);background:linear-gradient(135deg,rgba(217,119,6,.17),rgba(15,23,42,.78))}.mileage-segment-row.tone-3{border-color:rgba(168,85,247,.3);background:linear-gradient(135deg,rgba(126,34,206,.17),rgba(15,23,42,.78))}.mileage-segment-number{width:30px;height:30px;border-radius:10px;background:rgba(255,255,255,.1);display:grid;place-items:center;font-weight:800}.mileage-segment-route{min-width:0;display:grid;gap:4px}.mileage-segment-route b{font-size:15px;line-height:1.25}.mileage-segment-route i{font-style:normal;color:#60a5fa}.mileage-segment-route em{font-size:12px;color:#94a3b8;font-style:normal}.mileage-segment-input{position:relative}.mileage-segment-input input{width:100%;height:48px;border-radius:13px;border:1px solid rgba(148,163,184,.28);background:#070d14;color:#fff;font-size:18px;font-weight:800;padding:0 30px 0 10px;text-align:right}.mileage-segment-input small{position:absolute;right:9px;top:16px;color:#94a3b8}.mileage-editor-total{margin-top:15px;padding:15px 2px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(148,163,184,.18)}.mileage-editor-total span{color:#94a3b8}.mileage-editor-total b{font-size:25px}.mileage-editor-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}.mileage-editor-actions button{min-height:52px;border:0;border-radius:15px;font-size:16px;font-weight:800;background:#2563eb;color:white}.mileage-editor-actions button:disabled{opacity:.45}.mileage-editor-empty{padding:22px;text-align:center;color:#94a3b8}
@media(max-width:420px){.mileage-editor-card{padding:17px 14px;border-radius:23px}.mileage-segment-row{grid-template-columns:28px minmax(0,1fr);padding:12px}.mileage-segment-input{grid-column:2}.mileage-segment-input input{text-align:left;padding-right:36px}.mileage-editor-head b{font-size:20px}}
`;
  fs.writeFileSync(cssFile, css);
}

console.log('v109.6.7 editable daily mileage segments applied');
