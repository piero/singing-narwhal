<script lang="ts">
  // Editor for pages (.page.yaml): a list of elements with their
  // settings, a YAML source view and a live preview.
  import { onDestroy, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { debouncedSaver } from './saves';
  import { fontFamily, fontVariant, type FontRegistry } from '../core/fonts';
  import { imageSize } from '../core/images';
  import { PAGE_SIZES, type PageSizeName } from '../core/impose';
  import { DEFAULT_STYLE } from '../core/layout';
  import {
    elementKind,
    layoutPage,
    parsePage,
    serializePage,
    pageImages,
    type ElementKind,
    type PageElement,
    type PageDoc,
  } from '../core/pages';
  import { ImageUrls } from './assets.svelte';
  import { t, type Key } from './i18n.svelte';
  import DragHandle from './DragHandle.svelte';
  import FontSelect from './FontSelect.svelte';
  import Preview from './Preview.svelte';
  import { sortable } from './sortable';
  import { importImage, isImage, type Workspace } from './workspace';

  let {
    workspace,
    path,
    fonts,
    files,
    onfileschanged,
  }: { workspace: Workspace; path: string; fonts: FontRegistry; files: string[]; onfileschanged?: () => void } = $props();

  let tpl = $state<PageDoc | null>(null);
  let mode: 'elements' | 'source' = $state('elements');
  let page: PageSizeName = $state('A5');
  let previewTitle = $state('Canzoniere');
  let savedText = '';
  let sizes: Record<string, { width: number; height: number }> = $state({});
  const images = new ImageUrls((p) => workspace.readBytes(p));

  $effect(() => {
    workspace.readText(path).then((text) => {
      tpl = parsePage(text);
      savedText = serializePage(tpl);
    });
  });

  // Autosave.
  const saver = debouncedSaver(500);
  onDestroy(saver.flush);
  $effect(() => {
    if (!tpl) return;
    const text = serializePage(tpl);
    if (text === savedText) return;
    const target = path;
    saver.schedule(async () => {
      await workspace.writeText(target, text);
      savedText = text;
    });
  });

  // Image sizes, needed by the layout.
  $effect(() => {
    if (!tpl) return;
    for (const src of pageImages(tpl)) {
      if (sizes[src]) continue;
      workspace
        .readBytes(src)
        .then((b) => (sizes[src] = imageSize(b)))
        .catch(() => {});
    }
  });

  const laid = $derived.by(() => {
    if (!tpl) return null;
    return layoutPage($state.snapshot(tpl) as PageDoc, {
      fonts,
      ...PAGE_SIZES[page],
      defaultMargin: DEFAULT_STYLE.margin.left,
      defaultFont: DEFAULT_STYLE.lyrics.font,
      vars: { title: previewTitle },
      imageSizes: sizes,
    });
  });
  // Element boundaries in the preview, in each element's colour; the one under the
  // pointer (or being edited) in the list is highlighted.
  let hovered: number | null = $state(null);
  const outlines = $derived(
    mode === 'elements' && laid
      ? laid.bounds.map((b, i) => ({ ...b, color: `var(--k-${b.kind})`, highlight: i === hovered }))
      : [],
  );
  const sheets = $derived(laid ? [{ width: laid.width, height: laid.height, placements: [{ page: laid, x: 0, y: 0 }], foldLine: false }] : []);

  const KINDS: { kind: ElementKind; label: Key; make: () => PageElement }[] = [
    { kind: 'text', label: 'page.text', make: () => ({ text: 'Testo', size: 14 }) },
    { kind: 'image', label: 'page.image', make: () => ({ image: '', height: 'fill' }) },
    { kind: 'box', label: 'page.box', make: () => ({ box: '', height: 80, radius: 10 }) },
    { kind: 'lines', label: 'page.lines', make: () => ({ lines: 10, spacing: 22 }) },
    { kind: 'space', label: 'page.space', make: () => ({ space: 20 }) },
    { kind: 'rule', label: 'page.rule', make: () => ({ rule: true }) },
  ];
  const kindLabel = (k: ElementKind) => t(KINDS.find((x) => x.kind === k)!.label);

  function reorder(from: number, to: number) {
    const els = tpl!.elements;
    const [e] = els.splice(from, 1);
    els.splice(to, 0, e);
  }

  // Cards can be folded to their header (with a one-line summary), to see a long
  // page at a glance. Kept by element, so a card stays folded when it is moved.
  const collapsed = new SvelteSet<PageElement>();
  function toggle(e: PageElement) {
    if (collapsed.has(e)) collapsed.delete(e);
    else collapsed.add(e);
  }
  const allCollapsed = $derived(!!tpl?.elements.length && tpl.elements.every((e) => collapsed.has(e)));
  function toggleAll() {
    if (allCollapsed) collapsed.clear();
    else for (const e of tpl!.elements) collapsed.add(e);
  }
  function summary(e: PageElement): string {
    if ('text' in e) return e.text.split('\n').find((l) => l.trim()) ?? t('page.emptyText');
    if ('image' in e) return e.image ? e.image.split('/').pop()! : t('page.noImage');
    if ('box' in e) return e.box || t('page.emptyText');
    if ('lines' in e) return e.lines === 'fill' ? t('page.fill') : `× ${e.lines}`;
    if ('space' in e) return e.space === 'fill' ? t('page.fill') : `${e.space} pt`;
    return '';
  }

  let list = $state<HTMLOListElement>();
  async function addElement(make: () => PageElement) {
    tpl!.elements.push(make());
    await tick();
    const card = list?.lastElementChild as HTMLElement | null;
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    (card?.querySelector('.fields input, .fields textarea, .fields select') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  // Font picker: family + bold/italic, stored as a font id.
  type Styled = { font?: string };
  const isBold = (e: Styled) => /Bold/.test(e.font ?? '');
  const isItalic = (e: Styled) => /Italic|Oblique/.test(e.font ?? '');
  function setFont(e: Styled, family: string, bold: boolean, italic: boolean) {
    e.font = fontVariant(fonts, family, bold, italic);
  }

  let source = $state('');
  function showSource() {
    source = tpl ? serializePage(tpl) : '';
    mode = 'source';
  }
  function editSource(text: string) {
    source = text;
    try {
      tpl = parsePage(text);
    } catch {
      /* keep the last valid page while typing */
    }
  }
</script>

<!-- Fields: a caption above each control. -->
{#snippet fontPicker(e: Styled)}
  <div class="field font">
    <span class="caption">{t('page.font')}</span>
    <div class="controls">
      <FontSelect {fonts} value={fontFamily(e.font ?? DEFAULT_STYLE.lyrics.font)} onchange={(f) => setFont(e, f, isBold(e), isItalic(e))} />
      <button class="toggle b" class:on={isBold(e)} title="Bold" aria-pressed={isBold(e)} onclick={() => setFont(e, fontFamily(e.font ?? DEFAULT_STYLE.lyrics.font), !isBold(e), isItalic(e))}>B</button>
      <button class="toggle i" class:on={isItalic(e)} title="Italic" aria-pressed={isItalic(e)} onclick={() => setFont(e, fontFamily(e.font ?? DEFAULT_STYLE.lyrics.font), isBold(e), !isItalic(e))}>I</button>
    </div>
  </div>
{/snippet}

{#snippet alignPicker(e: { align?: 'left' | 'center' | 'right' })}
  <label class="field">
    <span class="caption">{t('page.align')}</span>
    <select bind:value={e.align}>
      <option value={undefined}>{t('page.left')}</option>
      <option value="center">{t('page.center')}</option>
      <option value="right">{t('page.right')}</option>
    </select>
  </label>
{/snippet}

{#snippet number(caption: string, value: number | undefined, set: (v: number | undefined) => void, attrs: { min?: number; max?: number; step?: number; placeholder?: string } = {})}
  <label class="field">
    <span class="caption">{caption}</span>
    <input type="number" {...attrs} value={value ?? ''} oninput={(ev) => set(ev.currentTarget.value === '' ? undefined : Number(ev.currentTarget.value))} />
  </label>
{/snippet}

<!-- A size in points, or "fill" to share the space left on the page. -->
{#snippet fillable(caption: string, value: number | 'fill' | undefined, set: (v: number | 'fill') => void, fallback: number, min = 0)}
  <div class="field">
    <span class="caption">{caption}</span>
    <div class="controls">
      <input
        type="number"
        {min}
        disabled={value === 'fill' || value === undefined}
        value={value === 'fill' || value === undefined ? '' : value}
        oninput={(ev) => set(Number(ev.currentTarget.value) || min)} />
      <label class="check"
        ><input type="checkbox" checked={value === 'fill' || value === undefined} onchange={(ev) => set(ev.currentTarget.checked ? 'fill' : fallback)} />
        {t('page.fill')}</label>
    </div>
  </div>
{/snippet}

{#if tpl}
  <div class="page-view">
    <section class="edit-pane">
      <div class="tabs">
        <button class:active={mode === 'elements'} onclick={() => (mode = 'elements')}>{t('page.elements')}</button>
        <button class:active={mode === 'source'} onclick={showSource}>{t('page.source')}</button>
      </div>
      {#if mode === 'elements'}
        {#if tpl.elements.length}
          <div class="list-head">
            <span class="summary">{t('page.elementCount', { n: tpl.elements.length })}</span>
            <button class="link" onclick={toggleAll}>{allCollapsed ? t('page.expandAll') : t('page.collapseAll')}</button>
          </div>
        {/if}
        <ol class="elements" bind:this={list} use:sortable={{ onmove: reorder }}>
          {#each tpl.elements as e, i (i)}
            {@const kind = elementKind(e)}
            {@const folded = collapsed.has(e)}
            <li
              style:--k="var(--k-{kind})"
              class:folded
              onpointerenter={() => (hovered = i)}
              onpointerleave={() => (hovered = null)}
              onfocusin={() => (hovered = i)}
              onfocusout={() => (hovered = null)}
            >
              <header>
                <DragHandle />
                <button class="fold" aria-expanded={!folded} title={folded ? t('page.expand') : t('page.collapse')} onclick={() => toggle(e)}>
                  <span class="chevron" aria-hidden="true"></span>
                  <strong>{kindLabel(kind)}</strong>
                  {#if folded}<span class="gist">{summary(e)}</span>{/if}
                </button>
                <button class="remove" title={t('book.remove')} aria-label={t('book.remove')} onclick={() => tpl!.elements.splice(i, 1)}>✕</button>
              </header>
              {#if !folded}
                <div class="fields">
                  {#if 'text' in e}
                    <textarea class="wide" rows={Math.max(2, e.text.split('\n').length)} bind:value={e.text}></textarea>
                    {@render fontPicker(e)}
                    {@render number(t('page.size'), e.size, (v) => (e.size = v), { min: 4, step: 0.5, placeholder: '12' })}
                    {@render alignPicker(e)}
                    {@render number(t('page.lineHeight'), e.line_height, (v) => (e.line_height = v), { min: 0.8, step: 0.05, placeholder: '1.25' })}
                    {@render number(t('page.indent'), e.indent, (v) => (e.indent = v), { min: 0, placeholder: '0' })}
                  {:else if 'image' in e}
                    <div class="field wide">
                      <span class="caption">{t('page.image')}</span>
                      <div class="controls">
                        <select class="grow" bind:value={e.image}>
                          <option value="">{t('page.chooseImage')}</option>
                          {#each files.filter(isImage) as f (f)}<option value={f}>{f}</option>{/each}
                        </select>
                        <button
                          class="pick"
                          onclick={async () => {
                            const p = await importImage(workspace, files);
                            if (!p) return;
                            onfileschanged?.();
                            e.image = p;
                          }}>{t('page.fromComputer')}</button>
                      </div>
                    </div>
                    {@render fillable(t('page.height'), e.height, (v) => (e.height = v), 80)}
                    <label class="field">
                      <span class="caption">{t('page.width')}</span>
                      <input type="number" min="5" max="100" value={Math.round((e.width ?? 1) * 100)} oninput={(ev) => (e.width = Number(ev.currentTarget.value) / 100)} />
                    </label>
                    {@render alignPicker(e)}
                  {:else if 'box' in e}
                    <label class="field wide">
                      <span class="caption">{t('page.label')}</span>
                      <input bind:value={e.box} />
                    </label>
                    {@render fillable(t('page.height'), e.height, (v) => (e.height = v), 80)}
                    {@render number(t('page.radius'), e.radius, (v) => (e.radius = v), { min: 0, placeholder: '8' })}
                    {@render fontPicker(e)}
                    {@render number(t('page.size'), e.size, (v) => (e.size = v), { min: 4, step: 0.5, placeholder: '13' })}
                    {@render alignPicker(e)}
                  {:else if 'lines' in e}
                    {@render fillable(t('page.count'), e.lines, (v) => (e.lines = v), 10, 1)}
                    {@render number(t('page.spacing'), e.spacing, (v) => (e.spacing = v), { min: 8, placeholder: '20' })}
                  {:else if 'space' in e}
                    {@render fillable(t('page.height'), e.space, (v) => (e.space = v), 20)}
                  {/if}
                  {#if !('space' in e)}
                    {@render number(t('page.marginTop'), e.margin, (v) => (e.margin = v), { min: 0, placeholder: '0' })}
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ol>
        {#if !tpl.elements.length}<p class="empty">{t('page.emptyPage')}</p>{/if}
        <div class="add">
          <span class="heading">{t('list.add')}</span>
          <div class="add-row">
            {#each KINDS as k (k.kind)}
              <button class="tinted" style:--k="var(--k-{k.kind})" onclick={() => addElement(k.make)}>+ {t(k.label)}</button>
            {/each}
          </div>
        </div>
        <p class="help">{t('page.placeholders')}</p>
      {:else}
        <textarea class="source" value={source} oninput={(e) => editSource(e.currentTarget.value)} spellcheck="false"></textarea>
      {/if}
    </section>
    <section class="preview-pane">
      <div class="toolbar">
        <label>{t('opt.page')} <select bind:value={page}>{#each Object.keys(PAGE_SIZES) as p (p)}<option value={p}>{p}</option>{/each}</select></label>
        <label>{t('page.previewTitle')} <input bind:value={previewTitle} /></label>
      </div>
      <div class="preview-scroll">
        <Preview {sheets} {outlines} imageUrl={(src) => images.get(src)} />
      </div>
    </section>
  </div>
{/if}

<style>
  .page-view {
    display: grid;
    grid-template-columns: minmax(420px, 1fr) minmax(380px, 1fr);
    height: 100%;
    min-height: 0;
  }
  section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }
  .edit-pane {
    border-right: 1px solid var(--line);
    overflow: auto;
    padding: 0 16px 16px;
  }
  .tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 12px;
    padding-top: 8px;
  }
  .tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 6px 4px;
    color: var(--muted);
    cursor: pointer;
  }
  .tabs button.active {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }
  .list-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .summary {
    font-size: 12px;
    color: var(--muted);
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
  }
  .link:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .elements {
    position: relative; /* item offsets for dragging (sortable.ts) */
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* Each kind of element has its own hue (see app.css): a stripe on the card and a
     tinted header, matching the Add buttons. */
  .elements li {
    border: 1px solid var(--line);
    border-left: 4px solid var(--k);
    border-radius: 6px;
    background: var(--bg);
  }
  .elements:global(.sorting) > li:not(:global(.dragging)) {
    transition: transform 0.15s ease;
  }
  .elements li:global(.dragging) {
    position: relative;
    z-index: 1;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  }
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 34px;
    padding: 0 6px 0 2px;
    border-radius: 0 5px 0 0;
    background: color-mix(in srgb, var(--k) 12%, var(--bg));
  }
  li.folded header {
    border-radius: 0 5px 5px 0;
  }
  .fold {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    align-self: stretch;
    padding: 8px 4px;
    border: none;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .chevron {
    flex: none;
    align-self: center;
    width: 5px;
    height: 5px;
    margin: 0 3px;
    border-right: 1.5px solid var(--muted);
    border-bottom: 1.5px solid var(--muted);
    transform: rotate(-45deg);
    transition: transform 0.15s;
  }
  li:not(.folded) .chevron {
    transform: rotate(45deg);
  }
  .gist {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 13px;
  }
  .remove {
    flex: none;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--muted);
    padding: 4px 6px;
    border-radius: 4px;
  }
  .remove:hover {
    background: var(--chip-hover);
    color: var(--fg);
  }

  /* Fields: caption above, laid out in rows that wrap. */
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    align-items: flex-start;
    padding: 12px 12px 14px;
    font-size: 13px;
  }
  .field {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    min-width: 0;
  }
  .caption {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
  }
  .check {
    gap: 4px;
    white-space: nowrap;
  }
  .wide {
    flex: 1 1 100%;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .fields textarea {
    width: 100%;
    box-sizing: border-box;
    font: 14px/1.4 inherit;
    resize: vertical;
  }
  input,
  select,
  .fields :global(select),
  textarea,
  .pick {
    font: inherit;
    padding: 4px 6px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
  }
  .fields :global(select) {
    max-width: 100%;
  }
  .pick {
    cursor: pointer;
    white-space: nowrap;
  }
  input[type='number'] {
    width: 5em;
  }
  input:disabled {
    opacity: 0.5;
  }
  .toggle {
    width: 28px;
    align-self: stretch;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    border-radius: 4px;
    cursor: pointer;
  }
  .toggle.b {
    font-weight: bold;
  }
  .toggle.i {
    font-style: italic;
  }
  .toggle.on {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .empty {
    margin: 0;
    padding: 16px;
    border: 1px dashed var(--line);
    border-radius: 6px;
    color: var(--muted);
    font-size: 13px;
    text-align: center;
  }
  .add {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
  }
  .heading {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .add-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .add .tinted {
    min-height: 30px;
  }
  .help {
    font-size: 12px;
    color: var(--muted);
  }
  .source {
    width: 100%;
    min-height: 500px;
    font: 13px/1.5 ui-monospace, Menlo, monospace;
    box-sizing: border-box;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .preview-scroll {
    overflow: auto;
    flex: 1;
    min-height: 0;
    background: var(--canvas);
  }
  /* Narrow editor area (phones, tablets, small windows): one pane at a time, switched from the top bar. */
  @container main (max-width: 900px) {
    .page-view {
      grid-template-columns: minmax(0, 1fr);
    }
    .edit-pane {
      border-right: none;
    }
    :global(main:not([data-pane='preview'])) .preview-pane,
    :global(main[data-pane='preview']) .edit-pane {
      display: none;
    }
  }
</style>
