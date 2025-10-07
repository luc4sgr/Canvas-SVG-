import { useRef, useEffect } from 'react';
import { Position, DebugEvent } from '../types';
import { getSvgPoint } from '../utils/svg';

export function useDraggable({
  id, pos, onChange, onDelta, onStart, onEnd, snap = 0, disabled = false, debug = false, onDebug,
}: {
  id?: string;
  pos: Position;
  onChange?: (p: Position) => void;
  onDelta?: (dx: number, dy: number) => void;
  onStart?: (startSvg: Position) => void;
  onEnd?: () => void;
  snap?: number;
  disabled?: boolean;
  debug?: boolean;
  onDebug?: (e: DebugEvent) => void;
}): React.RefObject<SVGGElement | null> {
  const ref = useRef<SVGGElement>(null);
  const posRef = useRef<Position>(pos);
  const onChangeRef = useRef<typeof onChange>(onChange);
  const onDeltaRef = useRef<typeof onDelta>(onDelta);
  const onStartRef = useRef<typeof onStart>(onStart);
  const onEndRef = useRef<typeof onEnd>(onEnd);
  const snapRef = useRef<number>(snap);
  const disabledRef = useRef<boolean>(disabled);
  const debugRef = useRef<boolean>(debug);

  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onDeltaRef.current = onDelta; }, [onDelta]);
  useEffect(() => { onStartRef.current = onStart; }, [onStart]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { snapRef.current = snap; }, [snap]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { debugRef.current = debug; }, [debug]);

  const bindCount = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node || disabledRef.current) return;
    const svg = node.ownerSVGElement as SVGSVGElement | null;
    if (!svg) return;

    bindCount.current += 1;

    let dragging = false;
    let startSvg: Position | null = null;
    let orig: Position | null = null;
    let rafId: number | null = null;
    let pending: Position | null = null;

    const flush = () => {
      if (pending) {
        onChangeRef.current?.(pending);
        pending = null;
        rafId = null;
      }
    };

    const dbg = (ev: DebugEvent) => {
      if (!debugRef.current) return;
      console.log('[drag]', ev.kind, { id, pointerId: ev.pointerId, buttons: ev.buttons, client: ev.client, svg: ev.svg, dx: ev.dx, dy: ev.dy, dragging: ev.dragging, bindCount: bindCount.current });
      try { onDebug?.(ev); } catch {}
    };

    const onPointerDown = (e: PointerEvent) => {
      if (disabledRef.current || e.button !== 0) return;
      e.preventDefault();
      node.setPointerCapture?.(e.pointerId);
      dragging = true;
      startSvg = getSvgPoint(svg, e.clientX, e.clientY);
      orig = { ...posRef.current };
      (node.style as any).cursor = 'grabbing';
      (node.style as any).touchAction = 'none';
      onStartRef.current?.(startSvg);
      dbg({ ts: performance.now(), kind: 'down', id, pointerId: e.pointerId, buttons: e.buttons, client: { x: e.clientX, y: e.clientY }, svg: startSvg, dragging });
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !startSvg || !orig) return;
      e.preventDefault();
      const curr = getSvgPoint(svg, e.clientX, e.clientY);
      const dx = curr.x - startSvg.x;
      const dy = curr.y - startSvg.y;

      if (onDeltaRef.current) {
        onDeltaRef.current(dx, dy);
      } else {
        const s = e.altKey ? 0 : snapRef.current;
        const snapIt = (v: number) => (s ? Math.round(v / s) * s : v);
        pending = { x: snapIt(orig.x + dx), y: snapIt(orig.y + dy) };
        if (rafId == null) rafId = requestAnimationFrame(flush);
      }

      dbg({ ts: performance.now(), kind: 'move', id, pointerId: e.pointerId, buttons: e.buttons, client: { x: e.clientX, y: e.clientY }, svg: curr, dx, dy, dragging });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      startSvg = null;
      orig = null;
      node.releasePointerCapture?.(e.pointerId);
      (node.style as any).cursor = 'grab';
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        if (pending) { onChangeRef.current?.(pending); pending = null; }
      }
      onEndRef.current?.();
      dbg({ ts: performance.now(), kind: 'up', id, pointerId: e.pointerId, buttons: e.buttons, client: { x: e.clientX, y: e.clientY }, dragging });
    };

    const onPointerCancel = (e: PointerEvent) => {
      dragging = false;
      startSvg = null;
      orig = null;
      node.releasePointerCapture?.(e.pointerId);
      (node.style as any).cursor = 'grab';
      onEndRef.current?.();
      dbg({ ts: performance.now(), kind: 'cancel', id, pointerId: e.pointerId, buttons: e.buttons, client: { x: e.clientX, y: e.clientY }, dragging });
    };

    const onLostPointerCapture = (e: PointerEvent) => {
      dbg({ ts: performance.now(), kind: 'lost', id, pointerId: e.pointerId, buttons: e.buttons, client: { x: e.clientX, y: e.clientY }, dragging });
    };

    node.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    node.addEventListener('lostpointercapture', onLostPointerCapture);

    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove as any);
      window.removeEventListener('pointerup', onPointerUp as any);
      window.removeEventListener('pointercancel', onPointerCancel as any);
      node.removeEventListener('lostpointercapture', onLostPointerCapture as any);
    };
  }, [disabled]);

  return ref;
}