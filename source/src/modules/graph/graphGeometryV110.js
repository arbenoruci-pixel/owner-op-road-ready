export const GRAPH = Object.freeze({ width:1000, left:52, right:54, top:30, row:62, stroke:5.5 });
export const TRACE_COLORS = Object.freeze({ OFF:'#687789', SB:'#7c8699', D:'#00866b', ON:'#2964cc' });
export const graphX = m => GRAPH.left + Number(m) / 1440 * (GRAPH.width - GRAPH.left - GRAPH.right);
export const graphY = status => GRAPH.top + ['OFF','SB','D','ON'].indexOf(status) * GRAPH.row + GRAPH.row/2;
export function traceGeometry(events = []) {
  const rows = events.filter(e => e && Object.hasOwn(TRACE_COLORS,e.status) && Number.isFinite(e.startMin) && Number.isFinite(e.endMin) && e.startMin >= 0 && e.endMin <= 1440 && e.endMin >= e.startMin).slice().sort((a,b) => a.startMin - b.startMin);
  const segments = [], discontinuities = [];
  rows.forEach((event,i) => {
    const previous = rows[i-1];
    const adjacent = !!previous && previous.endMin === event.startMin;
    const x1=graphX(event.startMin), x2=graphX(event.endMin), y=graphY(event.status);
    // The arriving vertical and horizontal share a single miter-joined SVG path.
    // Butt caps leave true gaps exposed, including gaps between equal statuses.
    const path = adjacent && previous.status !== event.status
      ? `M ${x1} ${graphY(previous.status)} V ${y} H ${x2}`
      : `M ${x1} ${y} H ${x2}`;
    segments.push({ event,adjacent,path,x1,x2,y });
    if (previous && !adjacent) discontinuities.push({ type:previous.endMin < event.startMin ? 'Gap' : 'Overlap',start:Math.min(previous.endMin,event.startMin),end:Math.max(previous.endMin,event.startMin) });
  });
  if (rows.length && rows[0].startMin > 0) discontinuities.unshift({type:'Gap',start:0,end:rows[0].startMin});
  const chains = [];
  for (const s of segments) {
    if (s.adjacent) chains[chains.length-1] += ` V ${s.y} H ${s.x2}`;
    else chains.push(`M ${s.x1} ${s.y} H ${s.x2}`);
  }
  return { segments,discontinuities,chains };
}
