<!-- The welcome tutorial: a short walk through the sidebar, shown at the first launch and
     from the Tutorial button. Each step highlights an element (marked with data-tour="…")
     and explains it, or shows a message in the middle. -->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { t, type Key } from './i18n.svelte';

  /** `onsidebar` opens or closes the sidebar where it is a drawer (narrow windows). */
  let { onclose, onsidebar }: { onclose: () => void; onsidebar: (open: boolean) => void } = $props();

  interface Step {
    id: string;
    /** data-tour of the element to highlight; none for a message in the middle. */
    target?: string;
  }

  const STEPS: Step[] = [{ id: 'welcome' }, { id: 'workspace', target: 'workspace' }, { id: 'lists', target: 'lists' }, { id: 'end' }];

  let i = $state(0);
  const step = $derived(STEPS[i]);
  /** The highlighted element's box, or null for a step in the middle of the screen. */
  let box = $state<DOMRect | null>(null);
  let card = $state<HTMLElement>();
  let pos = $state({ x: 0, y: 0 });

  const PAD = 6;
  const GAP = 12;

  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  async function show() {
    onsidebar(!!step.target);
    await tick();
    await frames();
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    // The drawer is still sliding in.
    if (el && el.getBoundingClientRect().left < 0) await new Promise((r) => setTimeout(r, 260));
    el?.scrollIntoView({ block: 'nearest' });
    box = el ? el.getBoundingClientRect() : null;
    await tick();
    place();
  }

  /** Next to the element: beside it, below, above, or over it if it fills the screen. */
  function place() {
    const w = card?.offsetWidth ?? 340;
    const h = card?.offsetHeight ?? 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampX = (x: number) => Math.max(12, Math.min(x, vw - w - 12));
    const clampY = (y: number) => Math.max(12, Math.min(y, vh - h - 12));
    if (!box) return void (pos = { x: (vw - w) / 2, y: (vh - h) / 2 });
    const b = box;
    const cx = clampX(b.left + b.width / 2 - w / 2);
    if (b.right + PAD + GAP + w < vw) pos = { x: b.right + PAD + GAP, y: clampY(b.top) };
    else if (b.bottom + PAD + GAP + h < vh) pos = { x: cx, y: b.bottom + PAD + GAP };
    else if (b.top - PAD - GAP - h > 0) pos = { x: cx, y: b.top - PAD - GAP - h };
    else pos = { x: cx, y: clampY(b.top + b.height / 2 - h / 2) };
  }

  // Again at every step.
  $effect(() => {
    void i;
    untrack(show);
  });

  function close() {
    onsidebar(false);
    onclose();
  }

  const go = (d: number) => {
    const n = i + d;
    if (n < 0) return;
    if (n >= STEPS.length) close();
    else i = n;
  };

  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  const text = (part: 'title' | 'text') => t(`tour.${step.id}.${part}` as Key);
</script>

<!-- Before the app's own keys (Escape, ⌘S), in the capture phase. -->
<svelte:window onkeydowncapture={keys} onresize={show} />

<!-- Clicks outside the card are caught, so the tutorial isn't left half way by accident. -->
<div class="veil" class:dim={!box}></div>
{#if box}
  <div class="hole" style:left="{box.left - PAD}px" style:top="{box.top - PAD}px" style:width="{box.width + 2 * PAD}px" style:height="{box.height + 2 * PAD}px"></div>
{/if}
<div class="card" bind:this={card} role="dialog" aria-modal="true" aria-labelledby="tour-title" style:left="{pos.x}px" style:top="{pos.y}px">
  <div class="head">
    <b id="tour-title">{text('title')}</b>
    <button class="close" title={t('tour.close')} aria-label={t('tour.close')} onclick={close}>✕</button>
  </div>
  <p>{@html text('text')}</p>
  <div class="foot">
    <span class="count">{t('tour.count', { n: i + 1, total: STEPS.length })}</span>
    <span class="grow"></span>
    {#if i > 0}<button onclick={() => go(-1)}>{t('tour.back')}</button>{/if}
    <!-- svelte-ignore a11y_autofocus -->
    <button class="primary" autofocus onclick={() => go(1)}>{t(i === STEPS.length - 1 ? 'tour.done' : 'tour.next')}</button>
  </div>
</div>

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 300;
  }
  .veil.dim {
    background: rgba(0, 0, 0, 0.45);
  }
  .hole {
    position: fixed;
    z-index: 300;
    border-radius: 8px;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    outline: 2px solid var(--accent);
    pointer-events: none;
    transition: all 0.2s ease;
  }
  .card {
    position: fixed;
    z-index: 301;
    width: min(340px, calc(100vw - 24px));
    box-sizing: border-box;
    padding: 14px 16px 12px;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    transition:
      left 0.2s ease,
      top 0.2s ease;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 15px;
  }
  p {
    margin: 8px 0 12px;
    line-height: 1.5;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .count {
    font-size: 12px;
    color: var(--muted);
  }
  .grow {
    flex: 1;
  }
  .foot button {
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    border-radius: 5px;
    padding: 3px 10px;
    cursor: pointer;
  }
  .foot button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .close {
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 4px;
  }
</style>
