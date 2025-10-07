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
type CxKind = 'canvas' | 'item';
interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  kind: CxKind;
  targetId?: string;
  svgPos?: Position;
}
interface HistoryState { items: Item[]; selected: string[] }
export type { Position, Item, Mode, DebugEvent, CxKind, ContextMenuState, HistoryState };