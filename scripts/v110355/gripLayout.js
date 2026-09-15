// CSS-pixel placement only. The SVG boundary remains at its exact log minute.
import { GRAPH as G, graphX } from '../../graph/graphGeometryV110.js';
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export function editorGripLayout(start, end, rawWidth) {
  const width = Math.max(160, Number(rawWidth) || 320);
  const x = minute => graphX(clamp(Number(minute) || 0, 0, 1440)) / G.width * width;
  const sx = x(start), ex = x(end), hit = 44, gap = 4, labelWidth = 64;
  let startLeft = clamp(sx - hit, 2, width - hit - 2);
  let endLeft = clamp(ex, 2, width - hit - 2);
  if (endLeft < startLeft + hit + gap) {
    startLeft = clamp((sx + ex - (2 * hit + gap)) / 2, 2, width - 2 * hit - gap - 2);
    endLeft = startLeft + hit + gap;
  }
  let startLabel = clamp(sx - labelWidth, 0, width - labelWidth);
  let endLabel = clamp(ex, 0, width - labelWidth);
  if (endLabel < startLabel + labelWidth + 2) {
    startLabel = clamp((sx + ex) / 2 - labelWidth - 1, 0, width - 2 * labelWidth - 2);
    endLabel = startLabel + labelWidth + 2;
  }
  return {
    width,
    start: { x: sx, left: startLeft, tip: clamp(sx - startLeft, 8, 36), labelLeft: startLabel },
    end: { x: ex, left: endLeft, tip: clamp(ex - endLeft, 8, 36), labelLeft: endLabel },
  };
}

// CSS clamps use the current containing block even before a resize observer fires.
export function editorGripLeft(edge, left, label = false) {
  const low = edge === 'start' ? (label ? 0 : 2) : (label ? 66 : 50);
  const reserve = edge === 'start' ? (label ? 130 : 94) : (label ? 64 : 46);
  return `clamp(${low}px, ${left}px, calc(100% - ${reserve}px))`;
}
