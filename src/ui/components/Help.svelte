<!-- A "?" that shows a help text on hover or keyboard focus: `text`, or richer content as
     children. The text floats over the page (fixed position, kept inside the window, above
     the "?" when there is no room below), so panels that scroll don't cut it. -->
<script lang="ts">
  import { tick, type Snippet } from 'svelte';

  let { text = '', width = 280, children }: { text?: string; width?: number; children?: Snippet } = $props();

  let anchor: HTMLButtonElement;
  let tip = $state<HTMLElement>();
  let pos = $state<{ x: number; y: number } | null>(null);

  async function show() {
    const r = anchor.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    pos = { x, y: r.bottom + 6 };
    await tick();
    const h = tip?.offsetHeight ?? 0;
    if (pos && r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8) pos = { x, y: r.top - 6 - h };
  }
  const hide = () => (pos = null);
</script>

<!-- A click shows it too (touch screens), without triggering what the "?" sits in. -->
<button
  type="button"
  class="help"
  bind:this={anchor}
  aria-label={text || undefined}
  onmouseenter={show}
  onmouseleave={hide}
  onfocus={show}
  onblur={hide}
  onclick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    show();
  }}>?</button>
{#if pos}
  <span class="tip" class:rich={!!children} role="tooltip" bind:this={tip} style:left="{pos.x}px" style:top="{pos.y}px" style:width="{Math.min(width, window.innerWidth - 16)}px">
    {#if children}{@render children()}{:else}{text}{/if}
  </span>
{/if}

<style>
  .help {
    padding: 0;
    background: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 10px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    line-height: 1;
    cursor: help;
    vertical-align: 1px;
    margin-left: 4px;
    flex: none;
  }
  .help:hover,
  .help:focus-visible {
    color: var(--accent);
    border-color: var(--accent);
    outline: none;
  }
  .tip {
    position: fixed;
    z-index: 100;
    box-sizing: border-box;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--line);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    font-size: 12px;
    font-weight: normal;
    text-align: left;
    text-transform: none;
    letter-spacing: 0;
    line-height: 1.45;
    white-space: pre-line;
    pointer-events: none;
  }
  .tip.rich {
    white-space: normal;
  }
</style>
