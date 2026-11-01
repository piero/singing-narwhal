<script lang="ts">
  // A chord diagram, drawn as it is printed. With `onchange` it can be edited: a click
  // on a fret puts the string's finger there (or lifts it), a click above the grid
  // switches the string between open and muted.
  import { diagramGeometry, diagramItems, type ChordShape } from '../core/diagrams';
  import type { FontRegistry } from '../core/fonts';
  import { t } from './i18n.svelte';

  let {
    shape,
    fonts,
    label = shape.name,
    scale = 2,
    onchange,
  }: { shape: ChordShape; fonts: FontRegistry; label?: string; scale?: number; onchange?: (s: ChordShape) => void } = $props();

  const font = $derived({ name: 'LiberationSans-Bold', size: 9 * scale, small: 'LiberationSans-Regular' });
  const drawn = $derived(diagramItems(shape, label, scale, fonts, font));
  const g = $derived(diagramGeometry(shape, scale, font.size));
  const half = $derived(g.stringX.length > 1 ? (g.stringX[1] - g.stringX[0]) / 2 : 6 * scale);

  function setFret(i: number, fret: number) {
    const frets = [...shape.frets];
    const fingers = [...shape.fingers];
    frets[i] = fret;
    fingers[i] = '';
    onchange?.({ ...shape, frets, fingers });
  }
</script>

<svg class="diagram" class:editable={!!onchange} viewBox="0 0 {drawn.width} {drawn.height}" width={drawn.width} height={drawn.height} role="img" aria-label={label}>
  {#each drawn.items as it, k (k)}
    {#if it.type === 'text'}
      <text x={it.x} y={it.y} font-family={it.font} font-size={it.size}>{it.text}</text>
    {:else if it.type === 'rule'}
      <line x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke-width={it.width} />
    {:else if it.type === 'dot'}
      <circle cx={it.x} cy={it.y} r={it.r} class:open={!it.fill} stroke-width={it.lineWidth} />
    {/if}
  {/each}
  {#if onchange}
    {#each shape.frets as f, i (i)}
      {@const x = g.stringX[i] - half}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <rect class="hit" {x} y={g.gridTop - 6 * scale} width={half * 2} height={6 * scale} onclick={() => setFret(i, f === 0 ? -1 : 0)}>
        <title>{t('lib.toggleOpen')}</title>
      </rect>
      {#each { length: g.rows } as _, r (r)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <rect class="hit" {x} y={g.fretY(r)} width={half * 2} height={g.fretY(r + 1) - g.fretY(r)} onclick={() => setFret(i, f === r + 1 ? 0 : r + 1)} />
      {/each}
    {/each}
  {/if}
</svg>

<style>
  .diagram {
    display: block;
    overflow: visible;
    color: var(--fg);
  }
  text {
    fill: currentColor;
  }
  line {
    stroke: currentColor;
  }
  circle {
    fill: currentColor;
  }
  circle.open {
    fill: none;
    stroke: currentColor;
  }
  .hit {
    fill: transparent;
    cursor: pointer;
  }
  .hit:hover {
    fill: color-mix(in srgb, var(--accent) 22%, transparent);
  }
</style>
