<script lang="ts">
  // A chord library (chords/*.chords.cho): diagrams that songs can show after their
  // lyrics. A workspace without libraries has the default one, the common guitar chords,
  // whose file is written on the first change (libraries.ts). New libraries start empty.
  // Each chord is edited on its diagram (click the frets) or as ChordPro numbers; the
  // file is a list of {define} lines, rewritten on every change. Importing and exporting
  // it are in its menu in the sidebar (App.svelte).
  import { tick } from 'svelte';
  import { chordNotation, noteName, parseChord, renderChord, type Notation } from '../../core/chords/chords';
  import { chordKey, parseLibrary, serializeLibrary, shapesNotation, type ChordShape } from '../../core/chords/diagrams';
  import type { FontRegistry } from '../../core/assets/fonts';
  import ChordDiagram from './ChordDiagram.svelte';
  import { COMMON_GUITAR_CHORDS, readChordLibrary } from './libraries';
  import Help from '../components/Help.svelte';
  import { t } from '../app/i18n.svelte';
  import { openFile } from '../workspace/saves.svelte';
  import type { Workspace } from '../workspace/workspace';

  let {
    workspace,
    path,
    fonts,
    onsaved,
  }: { workspace: Workspace; path: string; fonts: FontRegistry; onsaved?: () => void } = $props();

  /** null while loading. */
  let shapes = $state<ChordShape[] | null>(null);
  /** Whether the file exists (the default library has the common guitar chords before it does). */
  let exists = false;
  let savedText = $state('');
  let filter = $state('');
  let status = $state('');
  /** Cards whose frets or fingers field holds something that isn't valid (yet). */
  let invalid = $state<Record<string, boolean>>({});
  let list: HTMLElement | undefined = $state();

  $effect(() => {
    readChordLibrary(workspace, path).then((lib) => {
      exists = lib.exists;
      savedText = serializeLibrary(lib.shapes);
      // Changes recovered from the last session, still unsaved.
      const recovered = openFile.take(path);
      shapes = recovered === null ? lib.shapes : parseLibrary(recovered);
      if (order === 'note') sortByNote();
    });
  });

  // Saved when the user asks (Save, ⌘S in the app).
  const fileText = () => serializeLibrary((shapes ?? []).filter((s) => s.name.trim()));
  $effect(() => openFile.attach(workspace.location, path, save));
  $effect(() => {
    if (!shapes) return;
    const text = fileText();
    openFile.changed(text !== savedText ? text : null);
    if (text !== savedText && status === t('song.saved')) status = '';
  });
  async function save() {
    if (!shapes) return;
    const text = fileText();
    try {
      await workspace.writeText(path, text);
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
  }

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
   * By note, the chords are grouped by root (C, C#, D, …), major before minor, then by
   * name. Positions and groups are computed when asked for (and when a name is finished),
   * not while typing, so that a card being renamed stays in place; chords added since
   * wait in a group of their own at the end.
   */
  let byNote = $state<{ i: number; group: string; label: string }[]>([]);
  function sortByNote() {
    const list = shapes ?? [];
    const root = (s: ChordShape) => parseChord(s.name)?.root;
    const rank = (s: ChordShape) => {
      const c = parseChord(s.name);
      return c ? c.root.pc * 2 + (c.minor ? 1 : 0) : 99;
    };
    byNote = list
      .map((_, i) => i)
      .sort((a, b) => rank(list[a]) - rank(list[b]) || list[a].name.length - list[b].name.length || list[a].name.localeCompare(list[b].name))
      .map((i) => {
        const r = root(list[i]);
        return { i, group: r ? String(r.pc) : 'other', label: r ? noteName(r, chordNotation(list[i].name)) : t('lib.groupOther') };
      });
  }

  type Group = { key: string; label: string; items: { s: ChordShape; i: number }[] };
  /** The chords to show, in groups (a single one in the file's order), after the search. */
  const groups = $derived.by((): Group[] => {
    const list = shapes ?? [];
    const q = filter.trim().toLowerCase();
    const match = (i: number) => !q || list[i].name.toLowerCase().includes(q);
    if (order === 'file') return [{ key: 'all', label: '', items: list.map((s, i) => ({ s, i })).filter(({ i }) => match(i)) }];
    const out: Group[] = [];
    const seen = new Set<number>();
    for (const { i, group, label } of byNote) {
      if (i >= list.length) continue;
      seen.add(i);
      if (!match(i)) continue;
      // A group is named after its first chord's root, as that chord spells it.
      if (out.at(-1)?.key !== group) out.push({ key: group, label, items: [] });
      out.at(-1)!.items.push({ s: list[i], i });
    }
    const added = list.map((s, i) => ({ s, i })).filter(({ i }) => !seen.has(i) && match(i));
    if (added.length) out.push({ key: 'new', label: t('lib.groupNew'), items: added });
    return out;
  });
  const shown = $derived(groups.flatMap((g) => g.items));

  // Groups folded away, remembered between sessions; a search shows every group with matches.
  const CLOSED_KEY = 'narwhal:chordGroupsClosed';
  let closed = $state<string[]>(readClosed());
  function readClosed(): string[] {
    try {
      return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]');
    } catch {
      return [];
    }
  }
  function setClosed(list: string[]) {
    closed = list;
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify(list));
    } catch {
      /* storage unavailable */
    }
  }
  /** A name was finished: by note, the chord joins its group, which opens to show it. */
  function finishName(i: number) {
    if (order !== 'note') return;
    sortByNote();
    const g = byNote.find((x) => x.i === i)?.group;
    if (g && closed.includes(g)) setClosed(closed.filter((k) => k !== g));
  }
  const isOpen = (g: Group) => !!filter.trim() || !closed.includes(g.key);
  const toggle = (g: Group) => setClosed(closed.includes(g.key) ? closed.filter((k) => k !== g.key) : [...closed, g.key]);

  const notation = $derived(shapesNotation(shapes ?? []));

  /** Rewrite every chord name in a notation (songs find chords in either). */
  function convert(to: Notation) {
    shapes = shapes!.map((s) => ({ ...s, name: renderChord(s.name, { notation: to, transpose: 0 }) }));
    status = '';
    if (order === 'note') sortByNote(); // group names follow
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
    if (closed.includes('new')) setClosed(closed.filter((k) => k !== 'new'));
    await tick();
    const inputs = list?.querySelectorAll<HTMLInputElement>('input.name');
    inputs?.[inputs.length - 1]?.focus();
    inputs?.[inputs.length - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** An empty library can start from the common guitar chords. */
  function addCommon() {
    shapes = parseLibrary(COMMON_GUITAR_CHORDS);
    status = '';
    if (order === 'note') sortByNote();
  }

  function remove(i: number) {
    shapes!.splice(i, 1);
    invalid = {};
    if (order === 'note') sortByNote();
  }
</script>

{#snippet card(s: ChordShape, i: number)}
  <li class="card" class:dup={duplicateOf[i]}>
    <div class="draw">
      <ChordDiagram shape={s} {fonts} label={s.name || '?'} onchange={(n) => update(i, n)} />
    </div>
    <div class="fields">
      <label>
        <span>{t('lib.name')}</span>
        <input
          class="name"
          value={s.name}
          placeholder="Am"
          oninput={(e) => update(i, { ...s, name: e.currentTarget.value.replace(/\s+/g, '') })}
          onchange={() => finishName(i)} />
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
{/snippet}

<div class="library">
  <header>
    {#if shapes}
      <div class="tools">
        <input class="filter" type="search" placeholder={t('lib.search')} bind:value={filter} />
        <button class="primary" onclick={addChord}>+ {t('lib.add')}</button>
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
        {#if order === 'note'}
          <button class="link" onclick={() => setClosed(closed.length ? [] : groups.map((g) => g.key))}>{closed.length ? t('lib.expandAll') : t('lib.collapseAll')}</button>
        {/if}
        <Help text={t('lib.intro')} width={340} />
        <span class="status">{status || t('lib.count', { n: shapes.length })}</span>
      </div>
    {/if}
  </header>

  {#if shapes}
    <div bind:this={list}>
      {#each groups as g (g.key)}
        {#if order === 'note'}
          <h3 class="group">
            <button aria-expanded={isOpen(g)} onclick={() => toggle(g)} disabled={!!filter.trim()}>
              <span class="chevron" class:open={isOpen(g)} aria-hidden="true">▸</span>
              {g.label}
              <span class="n">{g.items.length}</span>
            </button>
          </h3>
        {/if}
        {#if order === 'file' || isOpen(g)}
          <ul class="cards">
            {#each g.items as { s, i } (i)}{@render card(s, i)}{/each}
          </ul>
        {/if}
      {/each}
    </div>
    {#if filter && !shown.length}<p class="none">{t('lib.noMatch')}</p>{/if}
    {#if !shapes.length}
      <p class="none">{t('lib.empty')} <button class="link" onclick={addCommon}>{t('lib.addCommon')}</button></p>
    {/if}
  {/if}
</div>

<style>
  .library {
    height: 100%;
    overflow: auto;
    padding: 14px 16px 32px;
    box-sizing: border-box;
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
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 10px;
  }
  .group {
    margin: 14px 0 8px;
    font-size: 15px;
  }
  .group button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: none;
    color: var(--fg);
    font: inherit;
    font-weight: 600;
    padding: 2px 6px 2px 0;
    cursor: pointer;
  }
  .group button:disabled {
    cursor: default;
  }
  .chevron {
    display: inline-block;
    color: var(--muted);
    font-size: 12px;
    transition: transform 0.15s;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .group .n {
    font-size: 12px;
    font-weight: 400;
    color: var(--muted);
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-size: 13px;
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
