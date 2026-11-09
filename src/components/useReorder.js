// useReorder.js — drag a list's rows by their handles into a new order, with a
// pointer (mouse or touch alike). Rows before `first` stay where they are and
// nothing can be dragged above them.
//
//   const { listRef, handle, dragging } = useReorder({ count, first, onMove });
//   <div ref={listRef}> rows, each one direct child, with <span {...handle(i)}> </div>

import { useCallback, useRef, useState } from 'react';

export function useReorder({ count, first = 0, onMove }) {
  const listRef = useRef(null);
  const [dragging, setDragging] = useState(-1);
  const st = useRef(null);
  const latest = useRef({ count, first, onMove });
  latest.current = { count, first, onMove };

  const handle = useCallback((i) => ({
    style: { touchAction: 'none' },
    onClick: (e) => e.stopPropagation(),
    onPointerDown: (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      st.current = { i };
      setDragging(i);
    },
    onPointerMove: (e) => {
      if (!st.current || !listRef.current) return;
      const list = listRef.current;
      const box = list.getBoundingClientRect();
      // near the list's ends, scroll it
      if (e.clientY < box.top + 28) list.scrollTop -= 10;
      else if (e.clientY > box.bottom - 28) list.scrollTop += 10;
      const rows = [...list.children];
      const { count: n, first: f, onMove: move } = latest.current;
      let to = n - 1;
      for (let k = 0; k < rows.length; k++) {
        const r = rows[k].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { to = k; break; }
      }
      // (moving down, the row's own place is still counted above the pointer)
      if (to > st.current.i) to -= 1;
      to = Math.max(f, Math.min(n - 1, to));
      if (to !== st.current.i) { move(st.current.i, to); st.current.i = to; setDragging(to); }
    },
    onPointerUp: () => { st.current = null; setDragging(-1); },
    onPointerCancel: () => { st.current = null; setDragging(-1); },
  }), []);

  return { listRef, handle, dragging };
}

// a copy of the list with item `from` moved to index `to`
export function moved(list, from, to) {
  const out = list.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
