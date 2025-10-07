import React from 'react';
import { Position, Item } from '../types';

interface CanvasProps {
  svgRef: React.RefObject<SVGSVGElement>;
  viewBox: { x: number; y: number; w: number; h: number };
  items: Item[];
  selected: Set<string>;
  mode: 'select' | 'pan';
  snap: boolean;
  debug: boolean;
  marquee: { active: boolean; start: Position; end: Position; add: boolean } | null;
  mouseSvg: Position | null;
  onSvgPointerDown: React.PointerEventHandler<SVGSVGElement>;
  onSvgPointerMove: React.PointerEventHandler<SVGSVGElement>;
  onSvgPointerUp: React.PointerEventHandler<SVGSVGElement>;
  onWheel: React.WheelEventHandler<SVGSVGElement>;
  onSvgContextMenu: React.MouseEventHandler<SVGSVGElement>;
  onItemClick: (id: string, e: React.MouseEvent) => void;
  onItemContextMenu: (id: string, e: React.MouseEvent) => void;
  renderItem: (item: Item) => React.ReactNode;
  isPanning: boolean;
}

export function Canvas({
  svgRef,
  viewBox,
  items,
  selected,
  mode,
  snap,
  debug,
  marquee,
  mouseSvg,
  onSvgPointerDown,
  onSvgPointerMove,
  onSvgPointerUp,
  onWheel,
  onSvgContextMenu,
  onItemClick,
  onItemContextMenu,
  renderItem,
  isPanning,
}: CanvasProps) {
  return (
    <svg
      ref={svgRef}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      className="w-full h-full bg-[#F3F7F6]"
      onPointerDown={onSvgPointerDown}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onWheel={onWheel}
      onContextMenu={onSvgContextMenu}
      style={{ cursor: mode === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
    >
      <defs>
        <pattern id="grid10" width={10} height={10} patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e5e9ec" strokeWidth="0.5" />
        </pattern>
        <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
        </filter>
      </defs>

      {/* Grid de fundo */}
      <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#grid10)" />

      {/* Crosshair de debug */}
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

      {/* Marquee de seleção */}
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

      {/* Itens */}
      {items.map(item => renderItem(item))}
    </svg>
  );
}