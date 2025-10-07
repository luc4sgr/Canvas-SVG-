import React from 'react';
import { ContextMenuState } from '../types';

export function ContextMenu({ state, onAddItem, onZoomIn, onZoomOut, onResetView, onSelectOnly, onDuplicate, onDelete }: {
  state: ContextMenuState;
  onAddItem: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onSelectOnly: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  if (!state.open) return null;
  
  return (
    <div id="cxmenu" className="absolute z-30 bg-white shadow-lg border rounded-md py-1 text-sm select-none" 
         style={{ left: state.x, top: state.y, minWidth: 180 }}>
      {state.kind === 'canvas' && (
        <>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={onAddItem}>
            Adicionar box aqui
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={onZoomIn}>
            Zoom in
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={onZoomOut}>
            Zoom out
          </button>
          <div className="h-px bg-gray-200 my-1" />
          <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={onResetView}>
            Reset view
          </button>
        </>
      )}
      {state.kind === 'item' && (
        <>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={onSelectOnly}>
            Selecionar apenas
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={onDuplicate}>
            Duplicar
          </button>
          <button className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50" onClick={onDelete}>
            Excluir…
          </button>
        </>
      )}
    </div>
  );
}