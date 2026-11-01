<script lang="ts">
  // Font family picker: bundled and workspace fonts, then the fonts installed on the
  // computer. A family that isn't available here (e.g. installed on another
  // computer) stays selected, marked as missing.
  import { fontFamilies, type FontRegistry } from '../core/fonts';
  import { t } from './i18n.svelte';

  let { fonts, value, onchange }: { fonts: FontRegistry; value: string; onchange: (family: string) => void } = $props();

  const families = $derived(fontFamilies(fonts));
  const own = $derived(families.filter((f) => !f.installed));
  const installed = $derived(families.filter((f) => f.installed));
  const missing = $derived(!families.some((f) => f.family === value));
</script>

<select {value} onchange={(e) => onchange(e.currentTarget.value)}>
  {#if missing}<option {value}>{t('font.missing', { name: value })}</option>{/if}
  {#each own as f (f.family)}<option value={f.family}>{f.label}</option>{/each}
  {#if installed.length}
    <optgroup label={t('font.installed')}>
      {#each installed as f (f.family)}<option value={f.family}>{f.label}</option>{/each}
    </optgroup>
  {/if}
</select>
