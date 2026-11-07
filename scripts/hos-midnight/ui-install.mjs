import fs from 'node:fs';
import assert from 'node:assert/strict';

// The compact clock panel must refresh while the same duty record is open and
// surface the provisional split condition already returned by the HOS engine.
// This view only reads clock results; it never writes a duty event or signature.
const file='source/src/modules/drive/HosCompactClocks.jsx';
let source=fs.readFileSync(file,'utf8');
const marker='HOS_MIDNIGHT_GUIDANCE_V1104108';
if(!source.includes(marker)) {
  function replace(before,after) {
    assert.equal(source.split(before).length,2,'HOS compact guidance anchor: '+before);
    source=source.replace(before,()=>after);
  }
  replace("import { calculateHosClocks, formatHosClockMinutes } from '../../core/hos/hosEngine.js';",
    "import { calculateHosClocks, formatHosClockMinutes } from '../../core/hos/hosEngine.js';\nimport { useLogbookClockV110 } from '../../shared/utils/useLogbookClockV110.js';");
  replace('  const hos = React.useMemo(() => calculateHosClocks(state, new Date()), [state]);',
    `  // ${marker}: the visible clock and its warning share one current instant.
  const clock = useLogbookClockV110(state);
  const hos = React.useMemo(() => calculateHosClocks(state, clock.at), [state, clock.at]);
  const guidance = (hos.warnings || []).find(item => item.severity === 'high')
    || (hos.warnings || []).find(item => item.type === 'splitPending');
  const guidanceIsHigh = guidance?.severity === 'high';`);
  replace('      <div className={`hos-restart-strip-v988 ${restart.tone}`}>',
    `      {guidance ? (
        <div
          data-hos-guidance={guidanceIsHigh ? 'limit' : 'pending'}
          role={guidanceIsHigh ? 'alert' : 'status'}
          style={{ marginTop:10, padding:'10px 12px', borderRadius:12,
            background:guidanceIsHigh ? '#fff1f2' : '#fffbeb',
            border:guidanceIsHigh ? '1px solid #fda4af' : '1px solid #fcd34d',
            color:guidanceIsHigh ? '#881337' : '#78350f', fontSize:13, lineHeight:1.4 }}
        >
          <b>{guidanceIsHigh ? 'HOS warning' : 'Split sleeper pending'}</b>
          <p style={{ margin:'4px 0 0' }}>{guidance.text.replace(/^Split sleeper pending:\\s*/i,'')}</p>
        </div>
      ) : null}
      <div className={\`hos-restart-strip-v988 \${restart.tone}\`}>`);
  fs.writeFileSync(file,source);
}
console.log('PASS — compact HOS clocks refresh and show pending split or active limit guidance');
