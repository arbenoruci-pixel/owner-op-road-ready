// CSS-pixel placement only. The SVG boundary remains at its exact log minute.
import { GRAPH as G, graphX } from '../../graph/graphGeometryV110.js';
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export function editorGripLayout(start, end, rawWidth) {
  const width = Math.max(160, Number(rawWidth) || 0 || 320);
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

// Resolve horizontal positions in CSS against the *current* frame width. This
// avoids a delayed ResizeObserver moving the target between pointer-down and drag.
export function editorGripLeft(edge, start, end, label = false) {
  const size = label ? 64 : 44, gap = label ? 2 : 4, pad = label ? 0 : 2;
  const percent = minute => graphX(clamp(Number(minute) || 0, 0, 1440)) / G.width * 100;
  const sx = percent(start), ex = percent(end), mid = (sx + ex) / 2;
  const startLeft = `clamp(${pad}px, min(calc(${sx}% - ${size}px), calc(${mid}% - ${size + gap / 2}px)), calc(100% - ${2 * size + gap + pad}px))`;
  if (edge === 'start') return startLeft;
  return `clamp(${size + gap + pad}px, max(${ex}%, calc(${startLeft} + ${size + gap}px)), calc(100% - ${size + pad}px))`;
}
