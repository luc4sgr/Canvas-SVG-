'use client';
import React, { JSX, useEffect, useMemo, useRef, useState } from 'react';
import { MousePointer2, Hand, ZoomIn as LucideZoomIn, ZoomOut as LucideZoomOut, ChevronDown, Check, Plus as PlusIcon, Trash2, RotateCcw, RotateCw } from 'lucide-react';

/**
 * PASSO 2.4 — Toolbar escura + Menu suspenso + Confirmar exclusão + Undo/Redo
 * --------------------------------------------------------------------------------------------
 *  - Mantém: pan/zoom, seleção múltipla, marquee, arrasto em grupo, contexto e debug
 *  - NOVO: confirmação antes de apagar (Backspace/Delete e menu de contexto)
 *  - NOVO: desfazer/refazer (Ctrl/Cmd+Z para Undo, Ctrl/Cmd+Shift+Z ou Ctrl+Y para Redo)
 *  - Snap, Debug, Menu centralizado e sem scroll continuam funcionando
 */

// -------------------- Types --------------------
interface Position { x: number; y: number }
interface Item { id: string; x: number; y: number; w: number; h: number; label: string }

type Mode = 'select' | 'pan';

interface DebugEvent {
  ts: number;
  kind: 'down' | 'move' | 'up' | 'cancel' | 'lost';
  id?: string;
  pointerId?: number;
  buttons?: number;
  client?: { x: number; y: number };
  svg?: { x: number; y: number };
  dx?: number;
  dy?: number;
  dragging?: boolean;
}

// Context menu state
type CxKind = 'canvas' | 'item';
interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  kind: CxKind;
  targetId?: string;
  svgPos?: Position;
}

// History (undo/redo)
interface HistoryState { items: Item[]; selected: string[] }

// -------------------- Utils --------------------
function getSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Position {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: clientX, y: clientY };
  const inv = m.inverse();
  const sp = pt.matrixTransform(inv);
  return { x: sp.x, y: sp.y };
}

function rectFrom2(a: Position, b: Position) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

function rectsIntersect(r1: {x:number;y:number;w:number;h:number}, r2: {x:number;y:number;w:number;h:number}): boolean {
  return !(r2.x > r1.x + r1.w ||
           r2.x + r2.w < r1.x ||
           r2.y > r1.y + r1.h ||
           r2.y + r2.h < r1.y);
}

// Pequeno ring buffer para logs em memória
function useRingBuffer<T>(cap = 200) {
  const buf = useRef<T[]>([]);
  const push = (v: T) => {
    buf.current.push(v);
    if (buf.current.length > cap) buf.current.shift();
  };
  const get = () => buf.current;
  const clear = () => { buf.current = []; };
  return { push, get, clear };
}

// -------------------- Hook: useDraggable --------------------
function useDraggable({
  id,
  pos,
  onChange,
  onDelta,
  onStart,
  onEnd,
  snap = 0,
  disabled = false,
  debug = false,
  onDebug,
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

  // Refs estáveis
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

    const applySnap = (v: number) => (snapRef.current ? Math.round(v / snapRef.current) * snapRef.current : v);

    const flush = () => {
      if (pending) {
        onChangeRef.current?.(pending);
        pending = null;
        rafId = null;
      }
    };

    const dbg = (ev: DebugEvent) => {
      if (!debugRef.current) return;
      // eslint-disable-next-line no-console
      console.log('[drag]', ev.kind, {
        id,
        pointerId: ev.pointerId,
        buttons: ev.buttons,
        client: ev.client,
        svg: ev.svg,
        dx: ev.dx, dy: ev.dy,
        dragging: ev.dragging,
        bindCount: bindCount.current,
      });
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

    // Assert simples de CTM
    const svgRect = svg.getBoundingClientRect();
    const mid = getSvgPoint(svg, svgRect.left + svgRect.width / 2, svgRect.top + svgRect.height / 2);
    console.assert(!Number.isNaN(mid.x) && !Number.isNaN(mid.y), '[assert] getSvgPoint deve retornar números válidos');

    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove as any);
      window.removeEventListener('pointerup', onPointerUp as any);
      window.removeEventListener('pointercancel', onPointerCancel as any);
      node.removeEventListener('lostpointercapture', onLostPointerCapture as any);
      if (debugRef.current) console.log('[drag] cleanup listeners', { id, bindCount: bindCount.current });
    };
  }, [disabled]);

  return ref;
}

function Draggable({ id, x, y, onChange, onDelta, onStart, onEnd, snap = 0, disabled = false, children, debug = false, onDebug, onClick, onContextMenu }:
  { id?: string; x: number; y: number; onChange?: (p: Position) => void; onDelta?: (dx: number, dy: number) => void; onStart?: (s: Position) => void; onEnd?: () => void; snap?: number; disabled?: boolean; children: React.ReactNode; debug?: boolean; onDebug?: (e: DebugEvent) => void; onClick?: React.MouseEventHandler<SVGGElement>; onContextMenu?: React.MouseEventHandler<SVGGElement> }) {
  const ref = useDraggable({ id, pos: { x, y }, onChange, onDelta, onStart, onEnd, snap, disabled, debug, onDebug });
  return (
    <g
      ref={ref}
      transform={`translate(${x} ${y})`}
      onPointerDown={(e) => { if (!disabled) e.stopPropagation(); }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ cursor: disabled ? 'default' : 'grab', touchAction: 'none', userSelect: 'none', pointerEvents: disabled ? 'none' : 'all' } as React.CSSProperties}
    >
      {children}
    </g>
  );
}

// -------------------- Componente principal --------------------
export default function Scada_UndoRedo_DeleteConfirm(): JSX.Element {
  const [items, setItems] = useState<Item[]>([
    { id: 'a', x: 240, y: 140, w: 120, h: 80, label: 'Box A' },
    { id: 'b', x: 460, y: 220, w: 140, h: 90, label: 'Box B' },
    { id: 'c', x: 360, y: 360, w: 100, h: 70, label: 'Box C' },
  ]);
  const [snap, setSnap] = useState(true);
  const [debug, setDebug] = useState(false);

  // Modo atual
  const [mode, setMode] = useState<Mode>('select');

  // viewBox para pan/zoom
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1200, h: 800 });

  // Seleção
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Marquee
  const [marquee, setMarquee] = useState<null | { active: boolean; start: Position; end: Position; add: boolean }>(null);

  // Group drag
  const groupOrig = useRef<Record<string, Position>>({});

  const svgRef = useRef<SVGSVGElement>(null);

  // -------------------- UNDO/REDO --------------------
  const undoStack = useRef<HistoryState[]>([]);
  const redoStack = useRef<HistoryState[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const bumpHistory = () => setHistoryTick(t => t + 1);
  const makeSnapshot = (): HistoryState => ({ items: items.map(i => ({ ...i })), selected: Array.from(selected) });
  const pushUndo = (snap?: HistoryState) => { undoStack.current.push(snap ?? makeSnapshot()); redoStack.current = []; bumpHistory(); };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    const now = makeSnapshot();
    redoStack.current.push(now);
    setItems(prev.items);
    setSelected(new Set(prev.selected));
    // Pequenos testes em runtime
    console.assert(Array.isArray(prev.items), '[undo] items deve ser array');
    bumpHistory();
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    const now = makeSnapshot();
    undoStack.current.push(now);
    setItems(next.items);
    setSelected(new Set(next.selected));
    bumpHistory();
  };

  // Confirmação de exclusão
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const requestDelete = (ids: string[]) => { if (ids.length === 0) return; setPendingDeleteIds(ids); setConfirmOpen(true); };
  const performDelete = () => {
    pushUndo();
    setItems(prev => prev.filter(i => !pendingDeleteIds.includes(i.id)));
    setSelected(prev => { const n = new Set(prev); pendingDeleteIds.forEach(id => n.delete(id)); return n; });
    setConfirmOpen(false);
    setPendingDeleteIds([]);
  };

  const addItem = (pos?: Position) => {
    pushUndo();
    const id = Math.random().toString(36).slice(2, 9);
    const x = pos?.x ?? 300;
    const y = pos?.y ?? 240;
    setItems(prev => ([
      ...prev,
      { id, x, y, w: 120, h: 80, label: `Box ${prev.length + 1}` },
    ]));
  };

  // Context menu state (clique direito)
  const [cx, setCx] = useState<ContextMenuState>({ open: false, x: 0, y: 0, kind: 'canvas' });
  const closeCx = () => setCx(prev => ({ ...prev, open: false }));

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if ((e.target as HTMLElement)?.closest?.('#cxmenu') == null) closeCx(); };

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      // Undo / Redo
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y')) { e.preventDefault(); redo(); return; }

      // Troca de ferramenta
      const k = e.key.toLowerCase();
      if (k === 'v') { setMode('select'); setToolMenu(false); }
      if (k === 'h') { setMode('pan'); setToolMenu(false); }
      if (k === 'k') { zoomInBtn(); setToolMenu(false); }

      // Delete/Backspace => confirmar
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.size > 0) {
          e.preventDefault();
          requestDelete(Array.from(selected));
          setToolMenu(false);
        }
      }

      // Modal: Enter confirma, Esc cancela
      if (confirmOpen) {
        if (e.key === 'Enter') { e.preventDefault(); performDelete(); }
        if (e.key === 'Escape') { e.preventDefault(); setConfirmOpen(false); }
      }
    };

    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [selected, confirmOpen, viewBox]);

  // Mouse crosshair + último ponto SVG (debug)
  const [mouseSvg, setMouseSvg] = useState<Position | null>(null);

  const { push: pushDbg, get: getDbg, clear: clearDbg } = useRingBuffer<DebugEvent>(300);
  const [lastDbg, setLastDbg] = useState<DebugEvent | null>(null);
  const handleDebug = (e: DebugEvent) => { pushDbg(e); setLastDbg(e); };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mid = getSvgPoint(svg, rect.left + rect.width / 2, rect.top + rect.height / 2);
    console.assert(!Number.isNaN(mid.x) && !Number.isNaN(mid.y), '[assert] getSvgPoint deve retornar números válidos (mount)');
  }, []);

  // -------------------- Seleção helpers --------------------
  const isSelected = (id: string) => selected.has(id);
  const selectOnly = (id: string) => setSelected(new Set([id]));
  const toggleSelect = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const clearSelection = () => setSelected(new Set());

  // -------------------- Canvas Pan/Zoom --------------------
  const isPanning = useRef(false);
  const panStartClient = useRef<Position>({ x: 0, y: 0 });
  const startViewBox = useRef(viewBox);

  const startPan = (clientX: number, clientY: number) => {
    isPanning.current = true;
    panStartClient.current = { x: clientX, y: clientY };
    startViewBox.current = { ...viewBox };
  };

  const doPan = (clientX: number, clientY: number) => {
    if (!isPanning.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dxPx = clientX - panStartClient.current.x;
    const dyPx = clientY - panStartClient.current.y;
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    setViewBox(prev => ({
      x: startViewBox.current.x - dxPx * scaleX,
      y: startViewBox.current.y - dyPx * scaleY,
      w: prev.w,
      h: prev.h,
    }));
  };

  const endPan = () => { if (isPanning.current) isPanning.current = false; };

  const zoomAt = (factor: number, center: Position) => {
    setViewBox(prev => {
      const nw = prev.w * factor;
      const nh = prev.h * factor;
      const nx = center.x - (center.x - prev.x) * (nw / prev.w);
      const ny = center.y - (center.y - prev.y) * (nh / prev.h);
      return { x: nx, y: ny, w: nw, h: nh };
    });
  };

  // ---- Zoom helpers em passos (5% ou 10%) ----
  const BASE_W = 1200;
  const BASE_H = 800;
  const zoomStepAt = (dir: 1 | -1, center: Position, stepPct = 10) => {
    setViewBox(prev => {
      const currPct = (BASE_W / prev.w) * 100;
      const min = 10;
      const max = 400;
      const currStep = Math.round(currPct / stepPct);
      let targetPct = (currStep + dir) * stepPct;
      if (targetPct < min) targetPct = min;
      if (targetPct > max) targetPct = max;
      if (Math.abs(targetPct - currPct) < 0.001) return prev;
      const nw = BASE_W / (targetPct / 100);
      const nh = BASE_H / (targetPct / 100);
      const nx = center.x - (center.x - prev.x) * (nw / prev.w);
      const ny = center.y - (center.y - prev.y) * (nh / prev.h);
      return { x: nx, y: ny, w: nw, h: nh };
    });
  };

  const onWheel: React.WheelEventHandler<SVGSVGElement> = (e) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = getSvgPoint(svg, e.clientX, e.clientY);
    const step = (e.altKey || e.shiftKey) ? 5 : 10;
    const delta: 1 | -1 = e.deltaY < 0 ? 1 : -1;
    zoomStepAt(delta, pt, step);
  };

  const resetView = () => setViewBox({ x: 0, y: 0, w: 1200, h: 800 });
  const zoomInBtn = (e?: React.MouseEvent) => {
    const step = e && (e.altKey || e.shiftKey) ? 5 : 10;
    const center = { x: viewBox.x + viewBox.w / 2, y: viewBox.y + viewBox.h / 2 };
    zoomStepAt(1, center, step);
  };
  const zoomOutBtn = (e?: React.MouseEvent) => {
    const step = e && (e.altKey || e.shiftKey) ? 5 : 10;
    const center = { x: viewBox.x + viewBox.w / 2, y: viewBox.y + viewBox.h / 2 };
    zoomStepAt(-1, center, step);
  };

  // -------------------- Canvas (marquee + pan + context menu) --------------------
  const onSvgPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (e.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;

    if (mode === 'pan') {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
      startPan(e.clientX, e.clientY);
      return;
    }

    // modo select => inicia marquee
    const start = getSvgPoint(svg, e.clientX, e.clientY);
    setMarquee({ active: true, start, end: start, add: e.shiftKey });
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
  };

  const onSvgPointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = getSvgPoint(svg, e.clientX, e.clientY);
    setMouseSvg(debug ? pt : null);

    if (mode === 'pan') { doPan(e.clientX, e.clientY); return; }
    if (marquee?.active) setMarquee(prev => prev ? { ...prev, end: pt } : prev);
  };

  const onSvgPointerUp: React.PointerEventHandler<SVGSVGElement> = () => {
    if (mode === 'pan') { endPan(); return; }
    if (!marquee?.active) return;
    const r = rectFrom2(marquee.start, marquee.end);
    const inRect = new Set(
      items.filter(it => rectsIntersect(r, { x: it.x - it.w/2, y: it.y - it.h/2, w: it.w, h: it.h }))
           .map(it => it.id)
    );
    setSelected(prev => marquee.add ? new Set([...prev, ...inRect]) : inRect);
    setMarquee(null);
  };

  const onSvgContextMenu: React.MouseEventHandler<SVGSVGElement> = (e) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = getSvgPoint(svg, e.clientX, e.clientY);
    setCx({ open: true, x: e.clientX, y: e.clientY, kind: 'canvas', svgPos: pt });
  };

  // -------------------- Arrasto em grupo / unitário com histórico --------------------
  const beforeDragSnapshot = useRef<HistoryState | null>(null);
  const movedDuringDrag = useRef(false);

  const handleGroupStart = () => {
    const map: Record<string, Position> = {};
    for (const it of items) if (selected.has(it.id)) map[it.id] = { x: it.x, y: it.y };
    groupOrig.current = map;
    beforeDragSnapshot.current = makeSnapshot();
    movedDuringDrag.current = false;
  };
  const handleGroupDelta = (dx: number, dy: number) => {
    const base = groupOrig.current;
    if (!base) return;
    movedDuringDrag.current = true;
    setItems(prev => prev.map(it => selected.has(it.id) ? { ...it, x: (base[it.id]?.x ?? it.x) + dx, y: (base[it.id]?.y ?? it.y) + dy } : it));
  };
  const handleGroupEnd = () => {
    if (movedDuringDrag.current && beforeDragSnapshot.current) pushUndo(beforeDragSnapshot.current);
    groupOrig.current = {};
    beforeDragSnapshot.current = null;
    movedDuringDrag.current = false;
  };

  // -------------------- Context menu actions --------------------
  const duplicateItem = (id: string) => {
    const it = items.find(i => i.id === id);
    if (!it) return;
    pushUndo();
    const nid = Math.random().toString(36).slice(2, 9);
    setItems(prev => [...prev, { ...it, id: nid, x: it.x + 20, y: it.y + 20, label: `${it.label} Copy` }]);
  };
  const deleteItem = (id: string) => { requestDelete([id]); };

  // -------------------- Debug panel --------------------
  const { push: pushDbg2, get: getDbg2, clear: clearDbg2 } = useRingBuffer<DebugEvent>(300);
  const debugPanel = useMemo(() => debug && (
    <div className="absolute bottom-20 left-6 bg-white/95 backdrop-blur rounded-lg shadow-lg p-3 w-[380px] text-xs font-mono z-20">
      <div className="flex items-center justify-between">
        <strong>Debug</strong>
        <button className="px-2 py-0.5 text-[11px] border rounded" onClick={clearDbg}>Clear</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <div>Eventos: {getDbg().length}</div>
          <div>Último: {lastDbg?.kind ?? '-'}</div>
          <div>Drag: {String(lastDbg?.dragging ?? false)}</div>
        </div>
        <div>
          <div>Client: {lastDbg?.client ? `${Math.round(lastDbg.client.x)}, ${Math.round(lastDbg.client.y)}` : '-'}</div>
          <div>SVG: {lastDbg?.svg ? `${Math.round(lastDbg.svg.x)}, ${Math.round(lastDbg.svg.y)}` : '-'}</div>
          <div>Δ: {lastDbg?.dx != null ? `${Math.round(lastDbg.dx)}, ${Math.round(lastDbg.dy || 0)}` : '-'}</div>
        </div>
      </div>
      <pre className="mt-2 max-h-48 overflow-auto bg-[#f7f7f7] p-2 rounded">{JSON.stringify(getDbg().slice(-20), null, 2)}</pre>
    </div>
  ), [debug, lastDbg]);

  // -------------------- Toolbar escura + menu suspenso --------------------
  const [toolMenu, setToolMenu] = useState(false);

  const ModeIcon = mode === 'select' ? MousePointer2 : Hand;

  const btnBase = 'h-10 min-w-[40px] rounded-xl inline-flex items-center justify-center transition active:scale-[.98] focus:outline-none focus:ring-2 focus:ring-white/10';
  const btnIdle = 'bg-white/5 hover:bg-white/10';
  const btnActive = 'bg-blue-600 text-white shadow ring-1 ring-white/10';
  const chipBase = 'h-10 px-3 rounded-xl inline-flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10';

  // -------------------- Render --------------------
  return (
    <div className="w-full h-screen bg-gray-100 flex flex-col overflow-hidden overscroll-none" style={{ userSelect: 'none' }}>
      <div className="relative flex-1 overflow-hidden">
        {debugPanel}

        {/* Context menu (clique direito) */}
        {cx.open && (
          <div id="cxmenu" className="absolute z-30 bg-white shadow-lg border rounded-md py-1 text-sm select-none"
               style={{ left: cx.x, top: cx.y, minWidth: 180 }}>
            {cx.kind === 'canvas' && (
              <>
                <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { addItem(cx.svgPos); closeCx(); }}>Adicionar box aqui</button>
                <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { if (cx.svgPos) zoomStepAt(1, cx.svgPos, 10); closeCx(); }}>Zoom in</button>
                <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { if (cx.svgPos) zoomStepAt(-1, cx.svgPos, 10); closeCx(); }}>Zoom out</button>
                <div className="h-px bg-gray-200 my-1" />
                <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { resetView(); closeCx(); }}>Reset view</button>
              </>
            )}
            {cx.kind === 'item' && (
              <>
                <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { if (cx.targetId) { selectOnly(cx.targetId); } closeCx(); }}>Selecionar apenas</button>
                <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { if (cx.targetId) duplicateItem(cx.targetId); closeCx(); }}>Duplicar</button>
                <button className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50" onClick={() => { if (cx.targetId) deleteItem(cx.targetId); closeCx(); }}>Excluir…</button>
              </>
            )}
          </div>
        )}

        {/* Modal de confirmação de exclusão */}
        {confirmOpen && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40">
            <div className="w-[420px] max-w-[92vw] bg-white rounded-xl shadow-2xl border p-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 text-red-600"><Trash2 size={20}/></div>
                <div>
                  <h3 className="font-semibold text-gray-900">Remover {pendingDeleteIds.length} item{pendingDeleteIds.length>1?'s':''}?</h3>
                  <p className="text-sm text-gray-600 mt-1">Esta ação pode ser desfeita com <kbd className="px-1.5 py-0.5 rounded bg-gray-100 border text-[11px]">Ctrl/Cmd+Z</kbd>.</p>
                  <ul className="mt-2 max-h-24 overflow-auto text-sm text-gray-700 list-disc pl-5">
                    {pendingDeleteIds.map(id => <li key={id}>{id}</li>)}
                  </ul>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button className="px-3 h-9 rounded-md border" onClick={() => setConfirmOpen(false)}>Cancelar</button>
                <button className="px-3 h-9 rounded-md bg-red-600 text-white hover:bg-red-700" onClick={performDelete}>Excluir</button>
              </div>
            </div>
          </div>
        )}

        {/* SVG Canvas */}
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="w-full h-full bg-[#F3F7F6]"
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onWheel={onWheel}
          onContextMenu={onSvgContextMenu}
          style={{ cursor: mode==='pan' ? (isPanning.current ? 'grabbing' : 'grab') : 'default' }}
        >
          <defs>
            <pattern id="grid10" width={10} height={10} patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e5e9ec" strokeWidth="0.5" />
            </pattern>
            <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* fundo em grid amplo */}
          <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#grid10)" />

          {/* crosshair/tooltip de debug */}
          {debug && mouseSvg && (
            <g>
              <line x1={mouseSvg.x - 12} y1={mouseSvg.y} x2={mouseSvg.x + 12} y2={mouseSvg.y} stroke="#3B82F6" strokeWidth={1} />
              <line x1={mouseSvg.x} y1={mouseSvg.y - 12} x2={mouseSvg.x} y2={mouseSvg.y + 12} stroke="#3B82F6" strokeWidth={1} />
              <rect x={mouseSvg.x + 10} y={mouseSvg.y + 10} width={120} height={24} rx={4} fill="#ffffffcc" stroke="#3B82F6" />
              <text x={mouseSvg.x + 16} y={mouseSvg.y + 26} fontFamily="monospace" fontSize={11} fill="#1f2937">
                ({Math.round(mouseSvg.x)}, {Math.round(mouseSvg.y)})
              </text>
            </g>
          )}

          {/* marquee (apenas no modo select) */}
          {mode === 'select' && marquee?.active && (
            <g>
              <rect
                x={Math.min(marquee.start.x, marquee.end.x)}
                y={Math.min(marquee.start.y, marquee.end.y)}
                width={Math.abs(marquee.end.x - marquee.start.x)}
                height={Math.abs(marquee.end.y - marquee.start.y)}
                fill="#3b82f622"
                stroke="#3B82F6"
                strokeDasharray="6 4"
              />
            </g>
          )}

          {/* itens */}
          {items.map(it => {
            const sel = isSelected(it.id);
            const groupActive = sel && selected.size > 0 && mode === 'select';

            // Arrasto unitário com snapshot
            const singleStart = () => { beforeDragSnapshot.current = makeSnapshot(); movedDuringDrag.current = false; };
            const singleChange = (p: Position) => { movedDuringDrag.current = true; setItems(prev => prev.map(n => n.id === it.id ? { ...n, ...p } : n)); };
            const singleEnd = () => { if (movedDuringDrag.current && beforeDragSnapshot.current) pushUndo(beforeDragSnapshot.current); beforeDragSnapshot.current = null; movedDuringDrag.current = false; };

            const props = groupActive ? {
              onChange: undefined,
              onDelta: handleGroupDelta,
              onStart: handleGroupStart,
              onEnd: handleGroupEnd,
            } : {
              onChange: singleChange,
              onDelta: undefined,
              onStart: singleStart,
              onEnd: singleEnd,
            };

            return (
              <Draggable
                key={it.id}
                id={it.id}
                x={it.x}
                y={it.y}
                snap={snap ? 10 : 0}
                debug={debug}
                onDebug={handleDebug}
                disabled={mode === 'pan'}
                {...props}
                onClick={(e) => {
                  if (mode === 'pan') return;
                  e.stopPropagation();
                  if (e.shiftKey) toggleSelect(it.id); else selectOnly(it.id);
                }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCx({ open: true, x: e.clientX, y: e.clientY, kind: 'item', targetId: it.id }); }}
              >
                <g filter="url(#softShadow)">
                  {sel && mode === 'select' && (
                    <rect x={-it.w/2 - 6} y={-it.h/2 - 6} width={it.w + 12} height={it.h + 12} rx={14} fill="none" stroke="#3B82F6" strokeDasharray="5 4" />
                  )}
                  <rect x={-it.w/2} y={-it.h/2} width={it.w} height={it.h} rx={12} fill="#eaeaea" stroke="#888" />
                  <text x={0} y={0} textAnchor="middle" fontFamily="sans-serif" fontSize={14} fill="#333">{it.label}</text>
                  <text x={0} y={20} textAnchor="middle" fontFamily="monospace" fontSize={11} fill="#666">({Math.round(it.x)}, {Math.round(it.y)})</text>
                </g>
              </Draggable>
            );
          })}
        </svg>

        {/* Toolbar escura, alinhada e centralizada */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
          <div className="rounded-2xl bg-[#0b1220]/90 backdrop-blur-md border border-white/10 shadow-2xl text-white px-2 py-2 flex items-center gap-2">
            {/* Botão principal com dropdown */}
            <div className="relative">
              <button
                className={`${btnBase} ${mode==='select' ? btnActive : btnIdle} px-3`}
                onClick={() => setToolMenu(v => !v)}
                title={mode==='select' ? 'Move (V)' : 'Hand tool (H)'}
                aria-haspopup="menu"
                aria-expanded={toolMenu}
              >
                <ModeIcon size={16} className="shrink-0" />
                <ChevronDown size={16} className="ml-1 shrink-0 opacity-80" />
              </button>
              {toolMenu && (
                <div
                  className="absolute left-0 bottom-full mb-2 min-w-[200px] rounded-xl border border-white/10 bg-[#0b0b0b] text-white shadow-2xl py-2"
                  onMouseLeave={() => setToolMenu(false)}
                >
                  <button className={`w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg:white/10 ${mode==='select' ? 'bg-blue-600' : ''}`} onClick={() => { setMode('select'); setToolMenu(false); }}>
                    {mode==='select' && <Check size={16}/>} 
                    <MousePointer2 size={16}/>
                    <span className="flex-1 text-sm">Move</span>
                    <span className="text-xs opacity-70">V</span>
                  </button>
                  <button className={`w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg:white/10 ${mode==='pan' ? 'bg-blue-600' : ''}`} onClick={() => { setMode('pan'); setToolMenu(false); }}>
                    {mode==='pan' && <Check size={16}/>} 
                    <Hand size={16}/>
                    <span className="flex-1 text-sm">Hand tool</span>
                    <span className="text-xs opacity-70">H</span>
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg:white/10" onClick={() => { zoomInBtn(); setToolMenu(false); }}>
                    <LucideZoomIn size={16}/>
                    <span className="flex-1 text-sm">Scale</span>
                    <span className="text-xs opacity-70">K</span>
                  </button>
                </div>
              )}
            </div>

            {/* Divisor */}
            <div className="w-px h-6 bg:white/10" />

            {/* Adicionar */}
            <button
              className={`${btnBase} ${btnIdle}`}
              title="Add box (center)"
              onClick={() => addItem({ x: viewBox.x + viewBox.w / 2, y: viewBox.y + viewBox.h / 2 })}
            >
              <PlusIcon size={16} />
            </button>

            {/* Undo/Redo */}
            <div className="flex items-center gap-1 pl-1">
              <button className={`${btnBase} ${btnIdle} ${undoStack.current.length===0 ? 'opacity-40 cursor-not-allowed' : ''}`} title="Undo (Ctrl/Cmd+Z)" onClick={undo} disabled={undoStack.current.length===0} aria-disabled={undoStack.current.length===0}><RotateCcw size={16}/></button>
              <button className={`${btnBase} ${btnIdle} ${redoStack.current.length===0 ? 'opacity-40 cursor-not-allowed' : ''}`} title="Redo (Ctrl/Cmd+Shift+Z / Ctrl+Y)" onClick={redo} disabled={redoStack.current.length===0} aria-disabled={redoStack.current.length===0}><RotateCw size={16}/></button>
            </div>

            {/* Divisor */}
            <div className="w-px h-6 bg:white/10" />

            {/* Zoom controls */}
            <div className="flex items-center gap-1 pl-1">
              <button className={`${btnBase} ${btnIdle}`} title="Zoom out" onClick={(e) => zoomOutBtn(e)}><LucideZoomOut size={16}/></button>
              <span className="px-2 text-xs tabular-nums opacity-90">{Math.round((1200 / viewBox.w) * 100)}%</span>
              <button className={`${btnBase} ${btnIdle}`} title="Zoom in" onClick={(e) => zoomInBtn(e)}><LucideZoomIn size={16}/></button>
              <button className={`${btnBase} ${btnIdle} px-3 text-xs`} title="Reset view" onClick={resetView}>Reset</button>
            </div>

            {/* Divisor */}
            <div className="w-px h-6 bg:white/10" />

            {/* Chips de opções */}
            <label className={`${chipBase} cursor-pointer select-none`}>
              <input type="checkbox" className="accent-blue-500" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
              Snap
            </label>
            <label className={`${chipBase} cursor-pointer select-none`}>
              <input type="checkbox" className="accent-blue-500" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
              Debug
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
