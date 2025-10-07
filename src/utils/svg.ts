import { Position } from '../types';

export function getSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Position {
  const pt = svg.createSVGPoint();
  pt.x = clientX; 
  pt.y = clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: clientX, y: clientY };
  const inv = m.inverse();
  const sp = pt.matrixTransform(inv);
  return { x: sp.x, y: sp.y };
}

export function rectFrom2(a: Position, b: Position) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

export function rectsIntersect(
  r1: {x:number; y:number; w:number; h:number}, 
  r2: {x:number; y:number; w:number; h:number}
): boolean {
  return !(r2.x > r1.x + r1.w || 
           r2.x + r2.w < r1.x || 
           r2.y > r1.y + r1.h || 
           r2.y + r2.h < r1.y);
}