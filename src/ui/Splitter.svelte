<script lang="ts">
  // The boundary between a view's editor and preview, dragged (or moved with the left and
  // right arrow keys) to share the width differently; a double click restores the view's
  // own proportions. It sits in a zero-width grid column between the two panes, whose
  // columns read --edit and --preview, e.g.
  //   grid-template-columns: minmax(380px, var(--edit, 1fr)) 0 minmax(380px, var(--preview, 1fr));
  // The share is remembered per view (`name`) in this browser or app.
  import { onMount } from 'svelte';
  import { t } from './i18n.svelte';

  let { name, min }: { name: string; /** The panes' minimum widths in px, as in the grid. */ min: [number, number] } = $props();

  const KEY = 'narwhal:split';
  const STEP = 0.02;

  let el: HTMLDivElement;
  /** The editor's share of the width, or null for the view's own proportions. */
  let share = $state<number | null>(null);

  function stored(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  function apply() {
    const view = el.parentElement!;
    if (share === null) {
      view.style.removeProperty('--edit');
      view.style.removeProperty('--preview');
    } else {
      view.style.setProperty('--edit', `${share}fr`);
      view.style.setProperty('--preview', `${1 - share}fr`);
    }
  }

  function save() {
    const all = stored();
    if (share === null) delete all[name];
    else all[name] = share;
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* storage unavailable */
    }
  }

  /** Sets the editor's share, keeping both panes at least their minimum width. */
  function set(next: number) {
    const width = el.parentElement!.clientWidth;
    const lo = Math.min(0.5, min[0] / width);
    const hi = Math.max(0.5, 1 - min[1] / width);
    share = Math.min(hi, Math.max(lo, next));
    apply();
  }

  /** The editor's share as currently laid out. */
  function current() {
    const view = el.parentElement!.getBoundingClientRect();
    return (el.getBoundingClientRect().left - view.left) / view.width;
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const view = el.parentElement!;
    const onmove = (ev: PointerEvent) => {
      const r = view.getBoundingClientRect();
      set((ev.clientX - r.left) / r.width);
    };
    const onend = () => {
      handle.removeEventListener('pointermove', onmove);
      handle.removeEventListener('pointerup', onend);
      handle.removeEventListener('pointercancel', onend);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      save();
    };
    handle.addEventListener('pointermove', onmove);
    handle.addEventListener('pointerup', onend);
    handle.addEventListener('pointercancel', onend);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? 5 : 1) * STEP;
    set(current() + (e.key === 'ArrowLeft' ? -step : step));
    save();
  }

  function reset() {
    share = null;
    apply();
    save();
  }

  onMount(() => {
    const s = stored()[name];
    if (typeof s === 'number' && s > 0 && s < 1) {
      share = s;
      apply();
    }
  });
</script>

<div class="splitter" bind:this={el}>
  <!-- A focusable separator is a control (WAI-ARIA window splitter). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="handle"
    role="separator"
    aria-orientation="vertical"
    aria-label={t('split.drag')}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={share === null ? undefined : Math.round(share * 100)}
    title={t('split.drag')}
    tabindex="0"
    {onpointerdown}
    {onkeydown}
    ondblclick={reset}>
  </div>
</div>

<style>
  .splitter {
    position: relative;
    z-index: 2;
    width: 0;
  }
  .handle {
    position: absolute;
    inset: 0 -4px;
    cursor: col-resize;
    touch-action: none;
  }
  .handle::after {
    content: '';
    position: absolute;
    inset: 0 3px;
    transition: background 0.15s;
  }
  .handle:hover::after,
  .handle:active::after,
  .handle:focus-visible::after {
    background: var(--accent);
  }
  .handle:focus-visible {
    outline: none;
  }
  /* One pane at a time (see the views): nothing to split. */
  @container main (max-width: 900px) {
    .splitter {
      display: none;
    }
  }
</style>
