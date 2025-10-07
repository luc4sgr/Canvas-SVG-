'use client';
import { ContextMenu } from '@/components/ContextMenu';
import { DebugPanel } from '@/components/DebugPanel';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { Draggable } from '@/components/Draggble';
import { Toolbar } from '@/components/Toolbar';
import { useRingBuffer } from '@/hooks/useRingBuffer';
import { ContextMenuState, DebugEvent, HistoryState, Item, Position } from '@/types';
import { getSvgPoint, rectFrom2, rectsIntersect } from '@/utils/svg';
import React, { useState, useRef, useEffect } from 'react';

export default function ScadaEditor() {
  // Estado principal
  const [items, setItems] = useState<Item[]>([
    { id: 'a', x: 240, y: 140, w: 120, h: 80, label: 'Box A' },
    { id: 'b', x: 460, y: 220, w: 140, h: 90, label: 'Box B' },
    { id: 'c', x: 360, y: 360, w: 100, h: 70, label: 'Box C' },
  ]);
  const [snap, setSnap] = useState(true);
  const [debug, setDebug] = useState(false);
  const [mode, setMode] = useState<'select' | 'pan'>('select');
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1200, h: 800 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<null | { active: boolean; start: Position; end: Position; add: boolean }>(null);
  const [toolMenu, setToolMenu] = useState(false);
  const groupOrig = useRef<Record<string, Position>>({});
  const svgRef = useRef<SVGSVGElement>(null);

  // Undo/Redo
  const undoStack = useRef<HistoryState[]>([]);
  const redoStack = useRef<HistoryState[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const makeSnapshot = (): HistoryState => ({ items: items.map(i => ({ ...i })), selected: Array.from(selected) });
  const pushUndo = (snap?: HistoryState) => { 
    undoStack.current.push(snap ?? makeSnapshot()); 
    redoStack.current = []; 
    setHistoryTick(t => t + 1); 
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(makeSnapshot());
    setItems(prev.items);
    setSelected(new Set(prev.selected));
    setHistoryTick(t => t + 1);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(makeSnapshot());
    setItems(next.items);
    setSelected(new Set(next.selected));
    setHistoryTick(t => t + 1);
  };

  // Confirmação de exclusão
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const requestDelete = (ids: string[]) => { 
    if (ids.length === 0) return; 
    setPendingDeleteIds(ids); 
    setConfirmOpen(true); 
  };
  const performDelete = () => {
    pushUndo();
    setItems(prev => prev.filter(i => !pendingDeleteIds.includes(i.id)));
    setSelected(prev => { 
      const n = new Set(prev); 
      pendingDeleteIds.forEach(id => n.delete(id)); 
      return n; 
    });
    setConfirmOpen(false);
    setPendingDeleteIds([]);
  };

  const addItem = (pos?: Position) => {
    pushUndo();
    const id = Math.random().toString(36).slice(2, 9);
    const x = pos?.x ?? viewBox.x + viewBox.w / 2;
    const y = pos?.y ?? viewBox.y + viewBox.h / 2;
    setItems(prev => ([...prev, { id, x, y, w: 120, h: 80, label: `Box ${prev.length + 1}` }]));
  };

  // Context menu
  const [cx, setCx] = useState<ContextMenuState>({ open: false, x: 0, y: 0, kind: 'canvas' });
  const closeCx = () => setCx(prev => ({ ...prev, open: false }));

  // Keyboard handlers
  useEffect(() => {
    const onDown = (e: MouseEvent) => { 
      if ((e.target as HTMLElement)?.closest?.('#cxmenu') == null) closeCx(); 
    };
    
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y')) { 
        e.preventDefault(); 
        redo(); 
        return; 
      }

      const k = e.key.toLowerCase();
      if (k === 'v') { setMode('select'); setToolMenu(false); }
      if (k === 'h') { setMode('pan'); setToolMenu(false); }
      if (k === 'k') { zoomInBtn(); setToolMenu(false); }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.size > 0) {
          e.preventDefault();
          requestDelete(Array.from(selected));
          setToolMenu(false);
        }
      }

      if (confirmOpen) {
        if (e.key === 'Enter') { e.preventDefault(); performDelete(); }
        if (e.key === 'Escape') { e.preventDefault(); setConfirmOpen(false); }
      }
    };

    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { 
      window.removeEventListener('mousedown', onDown); 
      window.removeEventListener('keydown', onKey); 
    };
  }, [selected, confirmOpen, viewBox]);

  // Debug
  const [mouseSvg, setMouseSvg] = useState<Position | null>(null);
  const { push: pushDbg, get: getDbg, clear: clearDbg } = useRingBuffer<DebugEvent>(300);
  const [lastDbg, setLastDbg] = useState<DebugEvent | null>(null);
  const handleDebug = (e: DebugEvent) => { pushDbg(e); setLastDbg(e); };

  // Seleção helpers
  const isSelected = (id: string) => selected.has(id);
  const selectOnly = (id: string) => setSelected(new Set([id]));
  const toggleSelect = (id: string) => setSelected(prev => { 
    const next = new Set(prev); 
    if (next.has(id)) next.delete(id); else next.add(id); 
    return next; 
  });
  const clearSelection = () => setSelected(new Set());

  // Pan/Zoom
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

  const endPan = () => { 
    if (isPanning.current) isPanning.current = false; 
  };

  const BASE_W = 1200, BASE_H = 800;
  const zoomStepAt = (dir: 1 | -1, center: Position, stepPct = 10) => {
    setViewBox(prev => {
      const currPct = (BASE_W / prev.w) * 100;
      const min = 10, max = 400;
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

  // Canvas handlers
  const onSvgPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (e.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;

    if (mode === 'pan') {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
      startPan(e.clientX, e.clientY);
      return;
    }

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

  // Arrasto em grupo
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
    setItems(prev => prev.map(it => 
      selected.has(it.id) 
        ? { ...it, x: (base[it.id]?.x ?? it.x) + dx, y: (base[it.id]?.y ?? it.y) + dy } 
        : it
    ));
  };

  const handleGroupEnd = () => {
    if (movedDuringDrag.current && beforeDragSnapshot.current) 
      pushUndo(beforeDragSnapshot.current);
    groupOrig.current = {};
    beforeDragSnapshot.current = null;
    movedDuringDrag.current = false;
  };

  // Context menu actions
  const duplicateItem = (id: string) => {
    const it = items.find(i => i.id === id);
    if (!it) return;
    pushUndo();
    const nid = Math.random().toString(36).slice(2, 9);
    setItems(prev => [...prev, { ...it, id: nid, x: it.x + 20, y: it.y + 20, label: `${it.label} Copy` }]);
  };

  const deleteItem = (id: string) => { requestDelete([id]); };

  return (
    <div className="w-full h-screen bg-gray-100 flex flex-col overflow-hidden overscroll-none" style={{ userSelect: 'none' }}>
      <div className="relative flex-1 overflow-hidden">
        {/* Debug Panel */}
        {debug && (
          <DebugPanel 
            events={getDbg()} 
            lastEvent={lastDbg} 
            onClear={clearDbg} 
          />
        )}

        {/* Context Menu */}
        <ContextMenu
          state={cx}
          onAddItem={() => { addItem(cx.svgPos); closeCx(); }}
          onZoomIn={() => { if (cx.svgPos) zoomStepAt(1, cx.svgPos, 10); closeCx(); }}
          onZoomOut={() => { if (cx.svgPos) zoomStepAt(-1, cx.svgPos, 10); closeCx(); }}
          onResetView={() => { resetView(); closeCx(); }}
          onSelectOnly={() => { if (cx.targetId) selectOnly(cx.targetId); closeCx(); }}
          onDuplicate={() => { if (cx.targetId) duplicateItem(cx.targetId); closeCx(); }}
          onDelete={() => { if (cx.targetId) deleteItem(cx.targetId); closeCx(); }}
        />

        {/* Delete Confirm Modal */}
        <DeleteConfirmModal
          open={confirmOpen}
          itemIds={pendingDeleteIds}
          onConfirm={performDelete}
          onCancel={() => setConfirmOpen(false)}
        />

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

          <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#grid10)" />

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

          {items.map(it => {
            const sel = isSelected(it.id);
            const groupActive = sel && selected.size > 0 && mode === 'select';

            const singleStart = () => { 
              beforeDragSnapshot.current = makeSnapshot(); 
              movedDuringDrag.current = false; 
            };
            const singleChange = (p: Position) => { 
              movedDuringDrag.current = true; 
              setItems(prev => prev.map(n => n.id === it.id ? { ...n, ...p } : n)); 
            };
            const singleEnd = () => { 
              if (movedDuringDrag.current && beforeDragSnapshot.current) 
                pushUndo(beforeDragSnapshot.current); 
              beforeDragSnapshot.current = null; 
              movedDuringDrag.current = false; 
            };

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
                onContextMenu={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  setCx({ open: true, x: e.clientX, y: e.clientY, kind: 'item', targetId: it.id }); 
                }}
              >
                <g filter="url(#softShadow)">
                  {sel && mode === 'select' && (
                    <rect 
                      x={-it.w/2 - 6} 
                      y={-it.h/2 - 6} 
                      width={it.w + 12} 
                      height={it.h + 12} 
                      rx={14} 
                      fill="none" 
                      stroke="#3B82F6" 
                      strokeDasharray="5 4" 
                    />
                  )}
                  <rect 
                    x={-it.w/2} 
                    y={-it.h/2} 
                    width={it.w} 
                    height={it.h} 
                    rx={12} 
                    fill="#eaeaea" 
                    stroke="#888" 
                  />
                  <text 
                    x={0} 
                    y={0} 
                    textAnchor="middle" 
                    fontFamily="sans-serif" 
                    fontSize={14} 
                    fill="#333"
                  >
                    {it.label}
                  </text>
                  <text 
                    x={0} 
                    y={20} 
                    textAnchor="middle" 
                    fontFamily="monospace" 
                    fontSize={11} 
                    fill="#666"
                  >
                    ({Math.round(it.x)}, {Math.round(it.y)})
                  </text>
                </g>
              </Draggable>
            );
          })}
        </svg>

        {/* Toolbar */}
        <Toolbar
          mode={mode}
          setMode={setMode}
          toolMenu={toolMenu}
          setToolMenu={setToolMenu}
          snap={snap}
          setSnap={setSnap}
          debug={debug}
          setDebug={setDebug}
          zoomPct={Math.round((1200 / viewBox.w) * 100)}
          onAddItem={() => addItem({ x: viewBox.x + viewBox.w / 2, y: viewBox.y + viewBox.h / 2 })}
          onUndo={undo}
          onRedo={redo}
          onZoomIn={zoomInBtn}
          onZoomOut={zoomOutBtn}
          onResetView={resetView}
          canUndo={undoStack.current.length > 0}
          canRedo={redoStack.current.length > 0}
        />
      </div>
    </div>
  );
}