// Reordering a list by dragging its items' handles (any element with data-handle
// inside an item), with the mouse, a finger or a pen. While dragging, the item
// follows the pointer and the others make room; the list itself changes only on
// release, through `onmove`. A focused handle also moves its item with the up and
// down arrow keys. The list must be positioned (e.g. position: relative), so that item
// offsets are measured from it.

export interface SortableOptions {
  onmove: (from: number, to: number) => void;
}

const EDGE = 48; // px from the scroll container's edge where dragging scrolls it

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

export function sortable(list: HTMLElement, options: SortableOptions) {
  let opts = options;
  const items = () => [...list.children] as HTMLElement[];
  const indexOf = (target: EventTarget | null) => {
    const handle = (target as HTMLElement | null)?.closest?.('[data-handle]');
    if (!handle || !list.contains(handle)) return -1;
    return items().findIndex((li) => li.contains(handle));
  };

  function onpointerdown(e: PointerEvent) {
    const from = indexOf(e.target);
    if (from < 0 || e.button !== 0) return;
    e.preventDefault();
    const handle = (e.target as HTMLElement).closest('[data-handle]') as HTMLElement;
    handle.setPointerCapture(e.pointerId);

    const els = items();
    const tops = els.map((li) => li.offsetTop);
    const heights = els.map((li) => li.offsetHeight);
    const dragged = els[from];
    const h = heights[from];
    const gap = els.length > 1 ? Math.max(0, tops[1] - tops[0] - heights[0]) : 0;
    const relY = (clientY: number) => clientY - list.getBoundingClientRect().top;
    const grab = relY(e.clientY) - tops[from];
    const min = tops[0];
    const max = tops[els.length - 1] + heights[els.length - 1] - h;
    const scroller = scrollParent(list);
    let pointerY = e.clientY;
    let to = from;

    list.classList.add('sorting');
    dragged.classList.add('dragging');
    document.body.style.userSelect = 'none';

    function layout() {
      const y = Math.min(max, Math.max(min, relY(pointerY) - grab));
      dragged.style.transform = `translateY(${y - tops[from]}px)`;
      const centre = y + h / 2;
      to = from;
      for (let k = 0; k < els.length; k++) {
        if (k === from) continue;
        const mid = tops[k] + heights[k] / 2;
        if (k > from && centre > mid) to = k;
        if (k < from && centre < mid && to >= from) to = k;
      }
      for (let k = 0; k < els.length; k++) {
        if (k === from) continue;
        const shift = from < k && k <= to ? -(h + gap) : to <= k && k < from ? h + gap : 0;
        els[k].style.transform = shift ? `translateY(${shift}px)` : '';
      }
    }

    // Scroll while the pointer is near the top or bottom of the scrolling pane.
    let frame = 0;
    function autoscroll() {
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const d = pointerY < r.top + EDGE ? pointerY - (r.top + EDGE) : pointerY > r.bottom - EDGE ? pointerY - (r.bottom - EDGE) : 0;
        if (d) {
          scroller.scrollTop += d / 4;
          layout();
        }
      }
      frame = requestAnimationFrame(autoscroll);
    }
    frame = requestAnimationFrame(autoscroll);

    function onmove(ev: PointerEvent) {
      pointerY = ev.clientY;
      layout();
    }
    function onend() {
      cancelAnimationFrame(frame);
      handle.removeEventListener('pointermove', onmove);
      handle.removeEventListener('pointerup', onend);
      handle.removeEventListener('pointercancel', onend);
      // Put everything back without animating, then let the data change reorder the list.
      list.classList.remove('sorting');
      dragged.classList.remove('dragging');
      for (const li of els) li.style.transform = '';
      document.body.style.userSelect = '';
      if (to !== from) opts.onmove(from, to);
    }
    handle.addEventListener('pointermove', onmove);
    handle.addEventListener('pointerup', onend);
    handle.addEventListener('pointercancel', onend);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const from = indexOf(e.target);
    if (from < 0) return;
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= list.children.length) return;
    e.preventDefault();
    opts.onmove(from, to);
    // Keep the focus on the moved item's handle.
    requestAnimationFrame(() => (list.children[to]?.querySelector('[data-handle]') as HTMLElement | null)?.focus());
  }

  list.addEventListener('pointerdown', onpointerdown);
  list.addEventListener('keydown', onkeydown);
  return {
    update(next: SortableOptions) {
      opts = next;
    },
    destroy() {
      list.removeEventListener('pointerdown', onpointerdown);
      list.removeEventListener('keydown', onkeydown);
    },
  };
}
