import React from 'react';
import { Trash2 } from 'lucide-react';

export function DeleteConfirmModal({ open, itemIds, onConfirm, onCancel }: { 
  open: boolean; 
  itemIds: string[]; 
  onConfirm: () => void; 
  onCancel: () => void 
}) {
  if (!open) return null;
  
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="w-[420px] max-w-[92vw] bg-white rounded-xl shadow-2xl border p-4">
        <div className="flex items-start gap-3">
          <div className="mt-1 text-red-600"><Trash2 size={20}/></div>
          <div>
            <h3 className="font-semibold text-gray-900">
              Remover {itemIds.length} item{itemIds.length>1?'s':''}?
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Esta ação pode ser desfeita com <kbd className="px-1.5 py-0.5 rounded bg-gray-100 border text-[11px]">Ctrl/Cmd+Z</kbd>.
            </p>
            <ul className="mt-2 max-h-24 overflow-auto text-sm text-gray-700 list-disc pl-5">
              {itemIds.map(id => <li key={id}>{id}</li>)}
            </ul>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button className="px-3 h-9 rounded-md border" onClick={onCancel}>Cancelar</button>
          <button className="px-3 h-9 rounded-md bg-red-600 text-white hover:bg-red-700" onClick={onConfirm}>Excluir</button>
        </div>
      </div>
    </div>
  );
}