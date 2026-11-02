<script lang="ts">
  // Grip that moves its item in a list made with `use:sortable` (drag it, or focus it
  // and press the up and down arrow keys).
  import { t } from '../app/i18n.svelte';
</script>

<button class="handle" data-handle title={t('list.drag')} aria-label={t('list.drag')}>
  <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
    {#each [3, 8, 13] as y (y)}<circle cx="2.5" cy={y} r="1.4" /><circle cx="7.5" cy={y} r="1.4" />{/each}
  </svg>
</button>

<style>
  .handle {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    align-self: stretch;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--muted);
    fill: currentColor;
    cursor: grab;
    touch-action: none;
  }
  .handle:hover,
  .handle:focus-visible {
    color: var(--fg);
    background: var(--chip-hover);
  }
  :global(.dragging) .handle {
    cursor: grabbing;
  }
</style>
