import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function replaceExact(source, before, after, label) {
  if (source.includes(after)) return source;
  assert.ok(source.includes(before), `110.2.7 wizard anchor missing: ${label}`);
  return source.replace(before, after);
}

{
  const path = 'source/src/modules/logbook/DayLogScreen.jsx';
  let source = fs.readFileSync(path, 'utf8');

  source = replaceExact(
    source,
    `function CoverageFixWizard({ issue, day, state, onClose, onSaveCoverageBlock }) {`,
    `function CoverageFixWizard({ issue, day, state, onClose, onSaveCoverageBlock, onNextProblem }) {`,
    'coverage wizard next callback',
  );

  source = replaceExact(
    source,
    `  const targetDay = issue?.day || day;\n  const check = useMemo(() => buildDotOfficerCheck(state, targetDay), [state, targetDay]);\n  const group = check.coverageGroup || (issue?.fixAction === 'OPEN_COVERAGE_WIZARD' ? issue : null);\n  const blocks = group?.missingBlocks || [];\n  const [index, setIndex] = useState(0);\n  const block = blocks[Math.min(index, Math.max(0, blocks.length - 1))] || null;`,
    `  const targetDay = issue?.day || day;\n  const rootDay = issue?._wizardRootDay || day;\n  const check = useMemo(() => buildDotOfficerCheck(state, targetDay), [state, targetDay]);\n  const [advanceAfterSave, setAdvanceAfterSave] = useState(null);\n  const group = check.coverageGroup || (!advanceAfterSave && issue?.fixAction === 'OPEN_COVERAGE_WIZARD' ? issue : null);\n  const blocks = group?.missingBlocks || [];\n  const [index, setIndex] = useState(0);\n  const block = blocks[Math.min(index, Math.max(0, blocks.length - 1))] || null;`,
    'coverage wizard state and root day',
  );

  source = replaceExact(
    source,
    `  useEffect(() => {\n    if (!issue) return;\n    setIndex(0);\n  }, [issue?.id, targetDay]);`,
    `  useEffect(() => {\n    if (!issue) return;\n    setIndex(0);\n    setAdvanceAfterSave(null);\n  }, [issue?.id, targetDay]);`,
    'coverage reset pending advance',
  );

  source = replaceExact(
    source,
    `  }, [block?.id]);\n\n  if (!issue) return null;`,
    `  }, [block?.id]);\n\n  useEffect(() => {\n    if (!advanceAfterSave) return;\n    const stillPresent = blocks.some(candidate => {\n      if (advanceAfterSave.id && candidate?.id) return candidate.id === advanceAfterSave.id;\n      return Number(candidate?.startMin) === Number(advanceAfterSave.startMin) && Number(candidate?.endMin) === Number(advanceAfterSave.endMin);\n    });\n    if (stillPresent) return;\n    setAdvanceAfterSave(null);\n    if (blocks.length) {\n      setIndex(0);\n      return;\n    }\n    onNextProblem?.({ day:targetDay, rootDay });\n  }, [advanceAfterSave, blocks, targetDay, rootDay, onNextProblem]);\n\n  if (!issue) return null;`,
    'coverage advance after persisted save',
  );

  source = replaceExact(
    source,
    `    onSaveCoverageBlock?.({\n      day: targetDay,\n      block,\n      blockIndex: index,\n      status,\n      city,\n      state: stateCode,\n      note: note || statusDefaultNote(status),\n    });\n    setIndex(0);\n  }`,
    `    onSaveCoverageBlock?.({\n      day: targetDay,\n      block,\n      blockIndex: index,\n      status,\n      city,\n      state: stateCode,\n      note: note || statusDefaultNote(status),\n    });\n    setAdvanceAfterSave({ id:block.id || '', startMin:block.startMin, endMin:block.endMin });\n  }\n\n  function skipCurrent() {\n    if (blocks.length > 1 && index < blocks.length - 1) {\n      setIndex(current => current + 1);\n      return;\n    }\n    onNextProblem?.({ day:targetDay, rootDay, skipped:true });\n  }`,
    'coverage save and skip advance',
  );

  source = replaceExact(
    source,
    `          <button type="button" className="secondary" onClick={() => setIndex(current => Math.min(current + 1, blocks.length - 1))}>Skip</button>`,
    `          <button type="button" className="secondary" onClick={skipCurrent}>Skip</button>`,
    'coverage skip next problem',
  );

  source = replaceExact(
    source,
    `      if (check.coverageGroup) setCoverageWizardIssue(check.coverageGroup);`,
    `      if (check.coverageGroup) setCoverageWizardIssue({ ...check.coverageGroup, _wizardRootDay:state.activeDay });`,
    'preserve root day from coverage request',
  );

  source = replaceExact(
    source,
    `    if (action === 'OPEN_COVERAGE_WIZARD') {\n      setCoverageWizardIssue(issue);\n      setActiveTab('sign');\n      return;\n    }`,
    `    if (action === 'OPEN_COVERAGE_WIZARD') {\n      setCoverageWizardIssue({ ...issue, _wizardRootDay:issue?._wizardRootDay || state.activeDay });\n      setActiveTab('sign');\n      return;\n    }`,
    'preserve wizard root day',
  );

  const parentAnchor = `  function handleDotOfficerIssue(issue = {}) {`;
  const parentHelper = `  function advanceToNextProblem({ fixedDay = state.activeDay, rootDay = state.activeDay, skipped = false } = {}) {\n    const reviewDay = rootDay || state.activeDay;\n    const nextCheck = buildDotOfficerCheck(state, reviewDay);\n\n    if (nextCheck.coverageGroup && reviewDay !== fixedDay) {\n      setCoverageWizardIssue({ ...nextCheck.coverageGroup, day:reviewDay, _wizardRootDay:reviewDay });\n      setActiveTab('log');\n      return;\n    }\n\n    const sameDayIssue = (nextCheck.issues || []).find(candidate =>\n      candidate.section !== 'previous' &&\n      candidate.fixAction !== 'OPEN_COVERAGE_WIZARD' &&\n      candidate.severity !== 'notice'\n    );\n\n    if (sameDayIssue) {\n      setCoverageWizardIssue(null);\n      handleDotOfficerIssue({ ...sameDayIssue, _wizardRootDay:reviewDay });\n      return;\n    }\n\n    const nextPrevious = (nextCheck.previousRows || []).find(row =>\n      row.issue && !(skipped && row.day === fixedDay)\n    );\n    if (nextPrevious?.issue) {\n      if (nextPrevious.status === 'Incomplete') {\n        const previousCheck = buildDotOfficerCheck(state, nextPrevious.day);\n        if (previousCheck.coverageGroup) {\n          setCoverageWizardIssue({ ...previousCheck.coverageGroup, day:nextPrevious.day, _wizardRootDay:reviewDay });\n          setActiveTab('log');\n          return;\n        }\n      }\n      setCoverageWizardIssue(null);\n      if (nextPrevious.issue.fixAction === 'CREATE_MISSING_DAY') {\n        setMissingDayIssue(nextPrevious.issue);\n        return;\n      }\n      handleDotOfficerIssue({ ...nextPrevious.issue, _wizardRootDay:reviewDay });\n      return;\n    }\n\n    setCoverageWizardIssue(null);\n    setActiveTab('sign');\n  }\n\n${parentAnchor}`;
  source = replaceExact(source, parentAnchor, parentHelper, 'parent next-problem router');

  source = replaceExact(
    source,
    `      <CoverageFixWizard issue={coverageWizardIssue} day={state.activeDay} state={state} onClose={() => setCoverageWizardIssue(null)} onSaveCoverageBlock={onSaveCoverageBlock} />`,
    `      <CoverageFixWizard issue={coverageWizardIssue} day={state.activeDay} state={state} onClose={() => setCoverageWizardIssue(null)} onSaveCoverageBlock={onSaveCoverageBlock} onNextProblem={advanceToNextProblem} />`,
    'wire next problem callback',
  );

  fs.writeFileSync(path, source);
}

{
  const path = 'source/src/app/App.jsx';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceExact(
    source,
    `undoTimerRef.current = window.setTimeout(() => setUndoNotice(null), 10000);`,
    `undoTimerRef.current = window.setTimeout(() => setUndoNotice(null), 2400);`,
    'short undo notice',
  );
  fs.writeFileSync(path, source);
}

{
  const path = 'source/src/styles.css';
  let source = fs.readFileSync(path, 'utf8');
  if (!source.includes('COMPACT_UNDO_NOTICE_V11027')) {
    source += `\n/* COMPACT_UNDO_NOTICE_V11027 */\n.change-undo-bar{left:auto!important;right:12px!important;top:calc(env(safe-area-inset-top) + 64px)!important;bottom:auto!important;transform:none!important;width:auto!important;max-width:min(270px,calc(100vw - 24px))!important;min-height:46px!important;padding:7px 8px 7px 12px!important;border-radius:14px!important;gap:9px!important;font-size:13px!important;line-height:1.15!important;box-shadow:0 8px 22px rgba(15,23,42,.2)!important;pointer-events:none!important}\n.change-undo-bar button{padding:7px 10px!important;border-radius:10px!important;font-size:13px!important;pointer-events:auto!important}\n`;
  }
  fs.writeFileSync(path, source);
}

const VERSION = '110.2.7';
const BUILD = 'v110207-wizard-next';
for (const path of ['release-version.json', 'public/app-version.json']) {
  const meta = JSON.parse(fs.readFileSync(path, 'utf8'));
  Object.assign(meta, {
    version: VERSION,
    build: BUILD,
    force: false,
    label: 'Fast Logbook editor',
    notes: [
      'Fix Wizard Save and next waits for the saved coverage block to persist, then advances to the next unresolved problem in the original DOT review.',
      'Skip advances to the next block or next problem instead of getting stuck on a one-step coverage screen.',
      'Change saved / Undo is compact, top-right, non-blocking, and clears after about 2.4 seconds.',
    ],
  });
  fs.writeFileSync(path, JSON.stringify(meta, null, 2) + '\n');
}

for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
  let source = fs.readFileSync(path, 'utf8');
  source = source.replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`), `$1'${BUILD}'`);
  fs.writeFileSync(path, source);
}

{
  const lockPath = 'module-locks.v1.json';
  const stablePath = 'source/src/modules/logbook/DayLogScreen.jsx';
  const locks = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  locks.release = VERSION;
  locks.files[stablePath] = crypto.createHash('sha256').update(fs.readFileSync(stablePath)).digest('hex');
  fs.writeFileSync(lockPath, JSON.stringify(locks, null, 2) + '\n');
}

console.log('PASS — 110.2.7 wizard next-problem flow and compact Undo notice finalized');
