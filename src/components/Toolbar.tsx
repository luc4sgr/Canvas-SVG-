import React, { Dispatch, SetStateAction } from 'react';
import { MousePointer2, Hand, ZoomIn as LucideZoomIn, ZoomOut as LucideZoomOut, ChevronDown, Check, Plus as PlusIcon, RotateCcw, RotateCw } from 'lucide-react';
import { Mode } from '../types';

export function Toolbar({ 
  mode, setMode, toolMenu, setToolMenu, snap, setSnap, debug, setDebug, 
  zoomPct, onAddItem, onUndo, onRedo, onZoomIn, onZoomOut, onResetView, canUndo, canRedo 
}: {
  mode: Mode; 
  setMode: (m: Mode) => void; 
  toolMenu: boolean; 
  setToolMenu: Dispatch<SetStateAction<boolean>>;
  snap: boolean; 
  setSnap: Dispatch<SetStateAction<boolean>>; 
  debug: boolean; 
  setDebug: Dispatch<SetStateAction<boolean>>; 
  zoomPct: number;
  onAddItem: () => void; 
  onUndo: () => void; 
  onRedo: () => void;
  onZoomIn: (e?: React.MouseEvent) => void; 
  onZoomOut: (e?: React.MouseEvent) => void; 
  onResetView: () => void;
  canUndo: boolean; 
  canRedo: boolean;
}) {
  const ModeIcon = mode === 'select' ? MousePointer2 : Hand;
  const btnBase = 'h-10 min-w-[40px] rounded-xl inline-flex items-center justify-center transition active:scale-[.98] focus:outline-none focus:ring-2 focus:ring-white/10';
  const btnIdle = 'bg-white/5 hover:bg-white/10';
  const btnActive = 'bg-blue-600 text-white shadow ring-1 ring-white/10';
  const chipBase = 'h-10 px-3 rounded-xl inline-flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10';

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
      <div className="rounded-2xl bg-[#0b1220]/90 backdrop-blur-md border border-white/10 shadow-2xl text-white px-2 py-2 flex items-center gap-2">
        {/* Dropdown de modo */}
        <div className="relative">
          <button 
            className={`${btnBase} ${mode==='select' ? btnActive : btnIdle} px-3`} 
            onClick={() => setToolMenu(v => !v)}
          >
            <ModeIcon size={16} className="shrink-0" />
            <ChevronDown size={16} className="ml-1 shrink-0 opacity-80" />
          </button>
          {toolMenu && (
            <div 
              className="absolute left-0 bottom-full mb-2 min-w-[200px] rounded-xl border border-white/10 bg-[#0b0b0b] text-white shadow-2xl py-2" 
              onMouseLeave={() => setToolMenu(false)}
            >
              <button 
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 ${mode==='select' ? 'bg-blue-600' : ''}`} 
                onClick={() => { setMode('select'); setToolMenu(false); }}
              >
                {mode==='select' && <Check size={16}/>} 
                <MousePointer2 size={16}/>
                <span className="flex-1 text-sm">Move</span>
                <span className="text-xs opacity-70">V</span>
              </button>
              <button 
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 ${mode==='pan' ? 'bg-blue-600' : ''}`} 
                onClick={() => { setMode('pan'); setToolMenu(false); }}
              >
                {mode==='pan' && <Check size={16}/>} 
                <Hand size={16}/>
                <span className="flex-1 text-sm">Hand tool</span>
                <span className="text-xs opacity-70">H</span>
              </button>
              <button 
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10" 
                onClick={() => { onZoomIn(); setToolMenu(false); }}
              >
                <LucideZoomIn size={16}/>
                <span className="flex-1 text-sm">Scale</span>
                <span className="text-xs opacity-70">K</span>
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Adicionar */}
        <button className={`${btnBase} ${btnIdle}`} title="Add box (center)" onClick={onAddItem}>
          <PlusIcon size={16} />
        </button>

        {/* Undo/Redo */}
        <div className="flex items-center gap-1 pl-1">
          <button 
            className={`${btnBase} ${btnIdle} ${!canUndo ? 'opacity-40 cursor-not-allowed' : ''}`} 
            title="Undo (Ctrl/Cmd+Z)" 
            onClick={onUndo} 
            disabled={!canUndo}
          >
            <RotateCcw size={16}/>
          </button>
          <button 
            className={`${btnBase} ${btnIdle} ${!canRedo ? 'opacity-40 cursor-not-allowed' : ''}`} 
            title="Redo (Ctrl/Cmd+Shift+Z / Ctrl+Y)" 
            onClick={onRedo} 
            disabled={!canRedo}
          >
            <RotateCw size={16}/>
          </button>
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1 pl-1">
          <button className={`${btnBase} ${btnIdle}`} title="Zoom out" onClick={(e) => onZoomOut(e)}>
            <LucideZoomOut size={16}/>
          </button>
          <span className="px-2 text-xs tabular-nums opacity-90">{zoomPct}%</span>
          <button className={`${btnBase} ${btnIdle}`} title="Zoom in" onClick={(e) => onZoomIn(e)}>
            <LucideZoomIn size={16}/>
          </button>
          <button className={`${btnBase} ${btnIdle} px-3 text-xs`} title="Reset view" onClick={onResetView}>
            Reset
          </button>
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Opções */}
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
  );
}