export const GRAPH = Object.freeze({ width:1000, left:52, right:54, top:30, row:62, stroke:5.5 });
export const TRACE_COLORS = Object.freeze({ OFF:'#687789', SB:'#7c8699', D:'#00866b', ON:'#2964cc' });
export const graphX = m => GRAPH.left + Number(m) / 1440 * (GRAPH.width - GRAPH.left - GRAPH.right);
export const graphY = status => GRAPH.top + ['OFF','SB','D','ON'].indexOf(status) * GRAPH.row + GRAPH.row/2;
export function traceGeometry(events = []) {
  const rows = events.filter(e => e && Object.hasOwn(TRACE_COLORS,e.status) && Number.isFinite(e.startMin) && Number.isFinite(e.endMin) && e.startMin >= 0 && e.endMin <= 1440 && e.endMin >= e.startMin).slice().sort((a,b) => a.startMin - b.startMin);
  const segments = [], discontinuities = [];
  rows.forEach((event,i) => {
    const previous = rows[i-1];
    // A third event spanning the boundary makes this bend ambiguous. Keep the
    // overlapping traces separate; retain their actual stored endpoints.
    const adjacent = !!previous && previous.endMin === event.startMin && !rows.some(other => other !== previous && other !== event && other.startMin < event.startMin && other.endMin > event.startMin);
    const x1=graphX(event.startMin), x2=graphX(event.endMin), y=graphY(event.status);
    const path = adjacent && previous.status !== event.status
      ? `M ${x1} ${graphY(previous.status)} V ${y} H ${x2}`
      : `M ${x1} ${y} H ${x2}`;
    segments.push({ event,adjacent,path,x1,x2,y });
  });
  // Coverage sweep handles nested overlaps without inventing a gap while another
  // stored event still covers that time. No stored endpoint is moved.
  const boundaries = [...new Set([0,...rows.flatMap(e => [e.startMin,e.endMin])])].sort((a,b)=>a-b);
  for (let i=1;i<boundaries.length;i++) {
    const start=boundaries[i-1],end=boundaries[i];
    const count=rows.filter(e=>e.startMin<end && e.endMin>start).length;
    const type=count===0?'Gap':count>1?'Overlap':null;
    if (!type || end<=start) continue;
    const last=discontinuities[discontinuities.length-1];
    if (last?.type===type && last.end===start) last.end=end;
    else discontinuities.push({type,start,end});
  }
  const chains = [];
  for (const s of segments) {
    if (s.adjacent) chains[chains.length-1] += ` V ${s.y} H ${s.x2}`;
    else chains.push(`M ${s.x1} ${s.y} H ${s.x2}`);
  }
  return { segments,discontinuities,chains };
}
