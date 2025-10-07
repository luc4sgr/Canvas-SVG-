import React from 'react';
import { DebugEvent } from '../types';

export function DebugPanel({ events, lastEvent, onClear }: { 
  events: DebugEvent[]; 
  lastEvent: DebugEvent | null; 
  onClear: () => void 
}) {
  return (
    <div className="absolute bottom-20 left-6 bg-white/95 backdrop-blur rounded-lg shadow-lg p-3 w-[380px] text-xs font-mono z-20">
      <div className="flex items-center justify-between">
        <strong>Debug</strong>
        <button className="px-2 py-0.5 text-[11px] border rounded" onClick={onClear}>Clear</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <div>Eventos: {events.length}</div>
          <div>Último: {lastEvent?.kind ?? '-'}</div>
          <div>Drag: {String(lastEvent?.dragging ?? false)}</div>
        </div>
        <div>
          <div>Client: {lastEvent?.client ? `${Math.round(lastEvent.client.x)}, ${Math.round(lastEvent.client.y)}` : '-'}</div>
          <div>SVG: {lastEvent?.svg ? `${Math.round(lastEvent.svg.x)}, ${Math.round(lastEvent.svg.y)}` : '-'}</div>
          <div>Δ: {lastEvent?.dx != null ? `${Math.round(lastEvent.dx)}, ${Math.round(lastEvent.dy || 0)}` : '-'}</div>
        </div>
      </div>
      <pre className="mt-2 max-h-48 overflow-auto bg-[#f7f7f7] p-2 rounded">{JSON.stringify(events.slice(-20), null, 2)}</pre>
    </div>
  );
}