import { useRef } from 'react';

export function useRingBuffer<T>(cap = 200) {
  const buf = useRef<T[]>([]);
  const push = (v: T) => {
    buf.current.push(v);
    if (buf.current.length > cap) buf.current.shift();
  };
  const get = () => buf.current;
  const clear = () => { buf.current = []; };
  return { push, get, clear };
}