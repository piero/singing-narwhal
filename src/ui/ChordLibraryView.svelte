<script lang="ts">
  // The chord library (chords.cho): diagrams that songs can show after their lyrics.
  // Each chord is edited on its diagram (click the frets) or as ChordPro numbers; the
  // file is a list of {define} lines, rewritten on every change.
  import { onDestroy, tick } from 'svelte';
  import { chordNotation, parseChord, renderChord, type Notation } from '../core/chords';
  import { CHORD_LIBRARY, chordKey, COMMON_GUITAR_CHORDS, parseLibrary, serializeLibrary, type ChordShape } from '../core/diagrams';
  import type { FontRegistry } from '../core/fonts';
  import ChordDiagram from './ChordDiagram.svelte';
  import { t } from './i18n.svelte';
  import { debouncedSaver } from './saves';
  import type { Workspace } from './workspace';

  let { workspace, fonts, onsaved }: { workspace: Workspace; fonts: FontRegistry; onsaved?: () => void } = $props();

  /** null while loading. */
  let shapes = $state<ChordShape[] | null>(null);
  let exists = $state(false);
  let savedText = '';
  let filter = $state('');
  let status = $state('');
  /** Cards whose frets or fingers field holds something that isn't valid (yet). */
  let invalid = $state<Record<string, boolean>>({});
  let list: HTMLElement | undefined = $state();

  $effect(() => {
    workspace
      .readText(CHORD_LIBRARY)
      .then((text) => {
        exists = true;
        savedText = serializeLibrary(parseLibrary(text));
        shapes = parseLibrary(text);
        if (order === 'note') sortByNote();
      })
      .catch(() => (shapes = []));
  });

  const saver = debouncedSaver(600);
  onDestroy(saver.flush);
  $effect(() => {
    if (!shapes) return;
    const text = serializeLibrary(shapes.filter((s) => s.name.trim()));
    if (text === savedText || (!exists && !shapes.length)) return;
    saver.schedule(async () => {
      try {
        await workspace.writeText(CHORD_LIBRARY, text);
        savedText = text;
        status = t('song.saved');
        if (!exists) {
          exists = true;
          onsaved?.();
        }
      } catch (e) {
        status = t('song.saveFailed', { msg: (e as Error).message });
        throw e; // also shown by the app
      }
    });
  });

  // The list is shown in the file's order or by note; sorting doesn't change the file.
  const ORDER_KEY = 'narwhal:chordOrder';
  let order = $state<'file' | 'note'>(readOrder());
  function readOrder(): 'file' | 'note' {
    try {
      return localStorage.getItem(ORDER_KEY) === 'note' ? 'note' : 'file';
    } catch {
      return 'file';
    }
  }
  function setOrder(o: 'file' | 'note') {
    order = o;
    if (o === 'note') sortByNote();
    try {
      localStorage.setItem(ORDER_KEY, o);
    } catch {
      /* storage unavailable */
    }
  }
  /**
   * Positions in the file, by note: by root (C, C#, D, …), then major before minor, then
   * by name. Computed when asked for, not while typing, so that a card being renamed stays
   * in place; chords added since are shown at the end.
   */
  let byNote = $state<number[]>([]);
  function sortByNote() {
    const rank = (s: ChordShape) => {
      const c = parseChord(s.name);
      return c ? c.root.pc * 2 + (c.minor ? 1 : 0) : 99;
    };
    const list = shapes ?? [];
    byNote = list
      .map((_, i) => i)
      .sort((a, b) => rank(list[a]) - rank(list[b]) || list[a].name.length - list[b].name.length || list[a].name.localeCompare(list[b].name));
  }

  const shown = $derived.by(() => {
    const list = shapes ?? [];
    let indices = list.map((_, i) => i);
    if (order === 'note') {
      const sorted = byNote.filter((i) => i < list.length);
      const seen = new Set(sorted);
      indices = [...sorted, ...indices.filter((i) => !seen.has(i))];
    }
    const q = filter.trim().toLowerCase();
    return indices.map((i) => ({ s: list[i], i })).filter(({ s }) => !q || s.name.toLowerCase().includes(q));
  });

  /** Notation of most chord names, null without any. */
  const notation = $derived.by((): Notation | null => {
    let it = 0;
    let en = 0;
    for (const s of shapes ?? []) {
      if (!parseChord(s.name)) continue;
      if (chordNotation(s.name) === 'italian') it++;
      else en++;
    }
    return it + en === 0 ? null : it > en ? 'italian' : 'english';
  });

  /** Rewrite every chord name in a notation (songs find chords in either). */
  function convert(to: Notation) {
    shapes = shapes!.map((s) => ({ ...s, name: renderChord(s.name, { notation: to, transpose: 0 }) }));
    status = '';
  }

  /** For each chord also defined earlier in the list, that earlier name: songs get the first. */
  const duplicateOf = $derived.by(() => {
    const first = new Map<string, string>();
    const out: Record<number, string> = {};
    (shapes ?? []).forEach((s, i) => {
      if (!s.name.trim()) return;
      const k = chordKey(s.name);
      if (first.has(k)) out[i] = first.get(k)!;
      else first.set(k, s.name);
    });
    return out;
  });

  function update(i: number, s: ChordShape) {
    shapes![i] = s;
    status = '';
  }

  const fretsText = (s: ChordShape) => s.frets.map((f) => (f < 0 ? 'x' : f)).join(' ');
  const fingersText = (s: ChordShape) => s.fingers.map((f) => f || '0').join(' ');

  function setFrets(i: number, text: string) {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    const frets = tokens.map((f) => (/^(x|n|-1)$/i.test(f) ? -1 : /^\d+$/.test(f) ? Number(f) : NaN));
    invalid[`${i}:frets`] = !frets.length || frets.some(Number.isNaN);
    if (invalid[`${i}:frets`]) return;
    const s = shapes![i];
    update(i, { ...s, frets, fingers: frets.map((f, k) => (f > 0 ? (s.fingers[k] ?? '') : '')) });
  }

  function setFingers(i: number, text: string) {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    invalid[`${i}:fingers`] = tokens.some((f) => !/^([0-9]|[A-Z]|-)$/.test(f));
    if (invalid[`${i}:fingers`]) return;
    const s = shapes![i];
    update(i, { ...s, fingers: s.frets.map((f, k) => (f > 0 && /^([1-9]|[A-Z])$/.test(tokens[k] ?? '') ? tokens[k] : '')) });
  }

  async function addChord() {
    const strings = shapes!.at(-1)?.frets.length ?? 6;
    shapes!.push({ name: '', baseFret: 1, frets: Array(strings).fill(0), fingers: Array(strings).fill('') });
    filter = '';
    await tick();
    const inputs = list?.querySelectorAll<HTMLInputElement>('input.name');
    inputs?.[inputs.length - 1]?.focus();
    inputs?.[inputs.length - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Add the common guitar chords the library doesn't have yet. */
  function addCommon() {
    const have = new Set(shapes!.map((s) => chordKey(s.name)));
    const add = parseLibrary(COMMON_GUITAR_CHORDS).filter((s) => !have.has(chordKey(s.name)));
    // Named like the library's other chords.
    shapes!.push(...add.map((s) => (notation ? { ...s, name: renderChord(s.name, { notation, transpose: 0 }) } : s)));
    if (order === 'note') sortByNote();
    status = t('lib.added', { n: add.length });
  }

  function remove(i: number) {
    shapes!.splice(i, 1);
    invalid = {};
    if (order === 'note') sortByNote();
  }
</script>

<div class="library">
  <header>
    <h2>{t('lib.title')}</h2>
    <p class="intro">{t('lib.intro')}</p>
    {#if shapes && (exists || shapes.length)}
      <div class="tools">
        <input class="filter" type="search" placeholder={t('lib.search')} bind:value={filter} />
        <button class="primary" onclick={addChord}>+ {t('lib.add')}</button>
        <button onclick={addCommon} title={t('lib.addCommonHelp')}>{t('lib.addCommon')}</button>
        <span class="seg" role="group" aria-label={t('opt.chords')}>
          {t('opt.chords')}
          <button class:active={notation === 'italian'} disabled={!notation} title={t('lib.toItalian')} onclick={() => convert('italian')}>Do Re Mi</button>
          <button class:active={notation === 'english'} disabled={!notation} title={t('lib.toEnglish')} onclick={() => convert('english')}>C D E</button>
        </span>
        <span class="seg" role="group" aria-label={t('lib.order')}>
          {t('lib.order')}
          <button class:active={order === 'file'} aria-pressed={order === 'file'} title={t('lib.orderFileHelp')} onclick={() => setOrder('file')}>{t('lib.orderFile')}</button>
          <button class:active={order === 'note'} aria-pressed={order === 'note'} title={t('lib.orderNoteHelp')} onclick={() => setOrder('note')}>{t('lib.orderNote')}</button>
        </span>
        <span class="status">{status || t('lib.count', { n: shapes.length })}</span>
      </div>
    {/if}
  </header>

  {#if shapes && !exists && !shapes.length}
    <div class="start">
      <p>{t('lib.empty')}</p>
      <button class="primary" onclick={addCommon}>{t('lib.startCommon')}</button>
      <button onclick={addChord}>{t('lib.startEmpty')}</button>
    </div>
  {:else if shapes}
    <ul class="cards" bind:this={list}>
      {#each shown as { s, i } (i)}
        <li class="card" class:dup={duplicateOf[i]}>
          <div class="draw">
            <ChordDiagram shape={s} {fonts} label={s.name || '?'} onchange={(n) => update(i, n)} />
          </div>
          <div class="fields">
            <label>
              <span>{t('lib.name')}</span>
              <input class="name" value={s.name} placeholder="Am" oninput={(e) => update(i, { ...s, name: e.currentTarget.value.replace(/\s+/g, '') })} />
            </label>
            <label title={t('lib.baseFretHelp')}>
              <span>{t('lib.baseFret')}</span>
              <input type="number" min="1" max="24" value={s.baseFret} oninput={(e) => update(i, { ...s, baseFret: Math.max(1, Math.floor(Number(e.currentTarget.value)) || 1) })} />
            </label>
            <label class="wide" title={t('lib.fretsHelp')}>
              <span>{t('lib.frets')}</span>
              <input class="mono" class:invalid={invalid[`${i}:frets`]} value={fretsText(s)} oninput={(e) => setFrets(i, e.currentTarget.value)} spellcheck="false" />
            </label>
            <label class="wide" title={t('lib.fingersHelp')}>
              <span>{t('lib.fingers')}</span>
              <input class="mono" class:invalid={invalid[`${i}:fingers`]} value={fingersText(s)} oninput={(e) => setFingers(i, e.currentTarget.value)} spellcheck="false" />
            </label>
            {#if duplicateOf[i]}<p class="warn">{t('lib.duplicate', { name: duplicateOf[i] })}</p>{/if}
          </div>
          <button class="remove" title={t('lib.remove')} aria-label={t('lib.remove')} onclick={() => remove(i)}>×</button>
        </li>
      {/each}
    </ul>
    {#if filter && !shown.length}<p class="none">{t('lib.noMatch')}</p>{/if}
  {/if}
</div>

<style>
  .library {
    height: 100%;
    overflow: auto;
    padding: 14px 16px 32px;
    box-sizing: border-box;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 20px;
  }
  .intro {
    margin: 0 0 12px;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
    max-width: 70ch;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 14px;
  }
  .filter {
    width: 11em;
  }
  .seg {
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    color: var(--muted);
  }
  .seg button {
    margin-left: -1px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    padding: 2px 9px;
    border-radius: 0;
    cursor: pointer;
  }
  .seg button:first-of-type {
    margin-left: 6px;
    border-radius: 5px 0 0 5px;
  }
  .seg button:last-of-type {
    border-radius: 0 5px 5px 0;
  }
  .seg button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .status {
    color: var(--muted);
    font-size: 12px;
    margin-left: auto;
  }
  input {
    font: inherit;
    padding: 3px 6px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
    min-width: 0;
  }
  input.invalid {
    border-color: #c5221f;
  }
  .mono {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 12px;
  }
  .start {
    border: 1px dashed var(--line);
    border-radius: 8px;
    padding: 16px;
    max-width: 60ch;
  }
  .start p {
    margin: 0 0 12px;
  }
  .start button {
    margin-right: 8px;
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 10px;
  }
  .card {
    position: relative;
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--sidebar);
  }
  .card.dup {
    border-color: #b06000;
  }
  .draw {
    flex: none;
  }
  .fields {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 8px;
    align-content: start;
    min-width: 0;
    flex: 1;
    padding-right: 14px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: stretch;
    min-width: 0;
  }
  label span {
    font-size: 11px;
    color: var(--muted);
  }
  label.wide {
    grid-column: 1 / -1;
  }
  input[type='number'] {
    width: 4em;
  }
  .warn {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 12px;
    color: #b06000;
  }
  .remove {
    position: absolute;
    top: 4px;
    right: 4px;
    border: none;
    background: none;
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }
  .remove:hover {
    color: var(--fg);
    background: var(--chip-hover);
  }
  .none {
    color: var(--muted);
  }
</style>
