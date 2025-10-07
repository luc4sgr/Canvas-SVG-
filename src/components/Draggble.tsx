import React from 'react';
import { Position, DebugEvent } from '../types';
import { useDraggable } from '@/hooks/useDraggle';


export function Draggable({ 
  id, x, y, onChange, onDelta, onStart, onEnd, snap = 0, disabled = false, 
  children, debug = false, onDebug, onClick, onContextMenu 
}: {
  id?: string; 
  x: number; 
  y: number;
  onChange?: (p: Position) => void;
  onDelta?: (dx: number, dy: number) => void;
  onStart?: (s: Position) => void;
  onEnd?: () => void;
  snap?: number;
  disabled?: boolean;
  children: React.ReactNode;
  debug?: boolean;
  onDebug?: (e: DebugEvent) => void;
  onClick?: React.MouseEventHandler<SVGGElement>;
  onContextMenu?: React.MouseEventHandler<SVGGElement>;
}) {
  const ref = useDraggable({ id, pos: { x, y }, onChange, onDelta, onStart, onEnd, snap, disabled, debug, onDebug });
  return (
    <g
      ref={ref}
      transform={`translate(${x} ${y})`}
      onPointerDown={(e) => { if (!disabled) e.stopPropagation(); }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ 
        cursor: disabled ? 'default' : 'grab', 
        touchAction: 'none', 
        userSelect: 'none', 
        pointerEvents: disabled ? 'none' : 'all' 
      } as React.CSSProperties}
    >
      {children}
    </g>
  );
}