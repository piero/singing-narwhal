<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { debouncedSaver, settleSaves } from '../workspace/saves';
  import { getMeta, parseSong } from '../../core/song/chordpro';
  import type { FontRegistry } from '../../core/assets/fonts';
  import { impose, PAGE_SIZES } from '../../core/print/impose';
  import { buildSongbook, parseSongbook, serializeSongbook, type BuiltBook, type ContentItem, type Songbook } from '../../core/songbook/songbook';
  import { serializePage, starterTemplate, type TemplateName } from '../../core/songbook/pages';
  import { ImageUrls } from '../app/fonts.svelte';
  import { i18n, t, type Key } from '../app/i18n.svelte';
  import Preview from '../components/Preview.svelte';
  import Splitter from '../components/Splitter.svelte';
  import { sortable } from '../components/sortable';
  import DragHandle from '../components/DragHandle.svelte';
  import { importImage, saveFile, zipSongbook } from '../workspace/files';
  import { isImage, isPage, isSong, type Workspace } from '../workspace/workspace';

  let {
    workspace,
    path,
    fonts,
    files,
    onopen,
    onfileschanged,
    onsaved,
  }: {
    workspace: Workspace;
    path: string;
    fonts: FontRegistry;
    files: string[];
    onopen: (path: string) => void;
    onfileschanged: () => void;
    /** Called after the songbook file is saved (its contents may have changed). */
    onsaved?: () => void;
  } = $props();

  let book = $state<Songbook | null>(null);
  let loadedPath = '';
  let savedText = '';
  let built = $state<BuiltBook | null>(null);
  /** The fonts `built` was laid out with. */
  let builtWith: FontRegistry | null = null;
  let view: 'sheets' | 'pages' = $state('sheets');
  let titles: Record<string, string> = $state({});
  let status = $state('');

  // Paths in the songbook are relative to the songbook file.
  const dir = $derived(path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');
  const rel = (p: string) => (dir && p.startsWith(dir) ? p.slice(dir.length) : dir ? '../'.repeat(dir.split('/').length - 1) + p : p);
  const abs = (p: string) => {
    const parts = (dir + p).split('/');
    const out: string[] = [];
    for (const part of parts) part === '..' ? out.pop() : out.push(part);
    return out.join('/');
  };
  const loader = $derived({
    readText: (p: string) => workspace.readText(abs(p)),
    readBytes: (p: string) => workspace.readBytes(abs(p)),
  });

  $effect(() => {
    const p = path;
    workspace.readText(p).then((t) => {
      loadedPath = p;
      book = parseSongbook(t);
      savedText = serializeSongbook(book);
    });
  });

  // Song titles for the lists.
  $effect(() => {
    for (const f of files.filter(isSong)) {
      if (titles[f]) continue;
      workspace.readText(f).then((t) => (titles[f] = getMeta(parseSong(t), 'title') || f.split('/').pop()!));
    }
  });

  // Rebuild and autosave after changes.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const saver = debouncedSaver(300);
  onDestroy(() => {
    clearTimeout(timer);
    saver.flush();
  });
  $effect(() => {
    if (!book) return;
    const text = serializeSongbook(book);
    const snapshot = $state.snapshot(book) as Songbook;
    void files; // rebuild when songs are edited
    const f = fonts; // and when installed fonts finish loading
    clearTimeout(timer);
    timer = setTimeout(async () => {
      built = await buildSongbook(snapshot, f, loader);
      builtWith = f;
    }, 300);
    if (loadedPath === path && text !== savedText) {
      const target = loadedPath;
      saver.schedule(async () => {
        await workspace.writeText(target, text);
        savedText = text;
        status = t('song.saved');
        onsaved?.();
      });
    }
  });

  const sheets = $derived(built ? (view === 'sheets' ? built.sheets : impose(built.pages, { kind: 'single' })) : []);

  function reorder(from: number, to: number) {
    if (!book) return;
    const [item] = book.contents.splice(from, 1);
    book.contents.splice(to, 0, item);
  }

  /** Kinds of contents, each with its own hue (see app.css). */
  type Kind = 'song' | 'page' | 'toc' | 'blank' | 'image';
  const kindOf = (c: ContentItem): Kind =>
    c === 'blank' ? 'blank' : 'song' in c ? 'song' : 'page' in c ? 'page' : 'image' in c ? 'image' : 'toc';
  const KIND_LABEL: Record<Kind, Key> = { song: 'kind.song', page: 'kind.page', toc: 'kind.toc', blank: 'kind.blank', image: 'kind.image' };

  // The settings can be folded away once chosen; remembered in this browser.
  const SETTINGS_KEY = 'narwhal:bookSettingsOpen';
  let settingsOpen = $state(readSettingsOpen());
  function readSettingsOpen() {
    try {
      return localStorage.getItem(SETTINGS_KEY) !== '0';
    } catch {
      return true;
    }
  }
  function toggleSettings(open: boolean) {
    settingsOpen = open;
    try {
      localStorage.setItem(SETTINGS_KEY, open ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }
  const IMPOSITIONS: { value: Songbook['imposition']; label: Key }[] = [
    { value: 'booklet', label: 'opt.booklet' },
    { value: '2up', label: 'opt.2up' },
    { value: 'single', label: 'opt.single' },
    { value: 'copies', label: 'opt.copies' },
  ];
  function remove(i: number) {
    book?.contents.splice(i, 1);
  }
  function add(item: ContentItem) {
    book?.contents.push(item);
  }

  const images = new ImageUrls((p) => workspace.readBytes(abs(p)));

  let addSong = $state('');
  let addImage = $state('');
  let addPage = $state('');
  const TEMPLATES: { name: TemplateName; label: Key }[] = [
    { name: 'cover', label: 'tpl.cover' },
    { name: 'quote', label: 'tpl.quote' },
    { name: 'notes', label: 'tpl.notes' },
    { name: 'lines', label: 'tpl.lines' },
    { name: 'empty', label: 'tpl.empty' },
  ];

  /** Add an existing page, or create a new one from a starter template ("new:cover"). */
  async function addPageItem(choice: string) {
    if (!choice) return;
    let file = choice;
    if (choice.startsWith('new:')) {
      const name = choice.slice(4) as TemplateName;
      const base = `pages/${t(TEMPLATES.find((x) => x.name === name)!.label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      file = `${base}.page.yaml`;
      for (let n = 2; files.includes(file); n++) file = `${base}-${n}.page.yaml`;
      await workspace.writeText(file, serializePage(starterTemplate(name, i18n.lang)));
      onfileschanged();
    }
    add({ page: rel(file) });
  }
  const included = $derived(new Set(book?.contents.flatMap((c) => (typeof c === 'object' && 'song' in c ? [abs(c.song)] : [])) ?? []));

  function itemLabel(c: ContentItem): string {
    if (c === 'blank') return t('book.blank');
    if ('song' in c) return titles[abs(c.song)] ?? c.song;
    if ('image' in c) return c.image.split('/').pop()!;
    if ('page' in c) return c.page.split('/').pop()!.replace(/\.page\.ya?ml$/i, '');
    return `${t('book.index')} ${c.toc}`;
  }
  function firstPage(c: ContentItem): number | undefined {
    if (typeof c !== 'object' || !('song' in c) || !built) return undefined;
    return built.index.find((e) => e.title === titles[abs(c.song)])?.page;
  }

  async function exportPdf() {
    if (!built || !book) return;
    // pdf-lib is loaded on the first export, to keep it out of the initial download.
    const { renderPdf } = await import('../../core/print/pdf');
    // Wait for installed fonts that are still loading, which the last build replaced
    // with Liberation Serif, and rebuild with them.
    for (let i = 0; i < 3; i++) {
      await fonts.idle();
      await tick();
      if (builtWith === fonts) break;
      clearTimeout(timer);
      built = await buildSongbook($state.snapshot(book) as Songbook, fonts, loader);
      builtWith = fonts;
    }
    const pdf = await renderPdf(built.sheets, fonts, { title: book.title, creator: __APP_NAME__, loadImage: loader.readBytes });
    await saveFile(`${path.split('/').pop()!.replace(/\.songbook\.ya?ml$/i, '')}.pdf`, pdf, 'application/pdf');
  }

  /** This songbook with its songs, pages, images and fonts, to move or share it. */
  async function exportZip() {
    await settleSaves();
    const { zip, missing } = await zipSongbook(workspace, path);
    if ((await saveFile(`${path.split('/').pop()!.replace(/\.songbook\.ya?ml$/i, '')}.zip`, zip, 'application/zip')) && missing.length)
      status = t('book.zipMissing', { files: missing.join(', ') });
  }
</script>

{#if book}
  <div class="book-view">
    <section class="edit-pane">
      <input class="title" placeholder={t('book.title')} bind:value={book.title} />

      <details class="settings" open={settingsOpen} ontoggle={(e) => toggleSettings(e.currentTarget.open)}>
        <summary>
          <span class="heading">{t('book.settings')}</span>
          <span class="summary">{book.page} · {t(IMPOSITIONS.find((x) => x.value === book!.imposition)?.label ?? 'opt.booklet')}</span>
        </summary>
        <div class="groups">
          <fieldset>
            <legend>{t('book.groupPrinting')}</legend>
            <label class="row">
              <span>{t('opt.page')}</span>
              <select bind:value={book.page}>{#each Object.keys(PAGE_SIZES) as p (p)}<option value={p}>{p}</option>{/each}</select>
            </label>
            <label class="row">
              <span>{t('opt.print')}</span>
              <select bind:value={book.imposition}>
                {#each IMPOSITIONS as im (im.value)}<option value={im.value}>{t(im.label)}</option>{/each}
              </select>
            </label>
            <label class="check"><input type="checkbox" bind:checked={book.pageNumbers} /> {t('book.pageNumbers')}</label>
            <label class="check"><input type="checkbox" bind:checked={book.keepSpreads} /> {t('book.keepSpreads')}</label>
            <label class="check"><input type="checkbox" bind:checked={book.foldLine} /> {t('book.foldLine')}</label>
          </fieldset>
          <fieldset>
            <legend>{t('book.groupSongs')}</legend>
            <label class="row" title={t('book.notationHelp')}>
              <span>{t('opt.chords')}</span>
              <select bind:value={book.notation}>
                <option value="original">{t('book.asWritten')}</option>
                <option value="italian">{t('book.allItalian')}</option>
                <option value="english">{t('book.allEnglish')}</option>
              </select>
            </label>
            <label class="row">
              <span>{t('song.columns')}</span>
              <select bind:value={book.columns}><option value="auto">{t('opt.auto')}</option><option value={1}>1</option><option value={2}>2</option></select>
            </label>
            <label class="row"><span>{t('book.lyricsSize')}</span><input type="number" step="0.5" min="6" max="20" bind:value={book.style.lyrics.size} /></label>
            <label class="row"><span>{t('book.chordsSize')}</span><input type="number" step="0.5" min="6" max="20" bind:value={book.style.chords.size} /></label>
            <label class="check"><input type="checkbox" bind:checked={book.showChords} /> {t('book.showChords')}</label>
          </fieldset>
        </div>
      </details>

      <div class="contents-head">
        <h3 class="heading">{t('book.contents')}</h3>
        {#if built}<span class="summary">{t('book.contentsInfo', { items: book.contents.length, pages: built.pages.length })}</span>{/if}
      </div>
      {#if book.contents.length}
        <ol class="contents" use:sortable={{ onmove: reorder }}>
          {#each book.contents as c, i (i)}
            {@const kind = kindOf(c)}
            <li style:--k="var(--k-{kind})">
              <DragHandle />
              <span class="page" title={t('book.firstPage')}>{firstPage(c) ?? ''}</span>
              <span class="kind">{t(KIND_LABEL[kind])}</span>
              <span class="label">
                {#if typeof c === 'object' && 'song' in c}
                  <button class="link" onclick={() => onopen(abs(c.song))}>{itemLabel(c)}</button>
                {:else if typeof c === 'object' && 'page' in c}
                  <button class="link" onclick={() => onopen(abs(c.page))}>{itemLabel(c)}</button>
                {:else if typeof c === 'object' && 'toc' in c}
                  <input class="inline" aria-label={t('book.indexTitleLabel')} bind:value={c.toc} />
                {:else}
                  <span class="plain">{itemLabel(c)}</span>
                {/if}
              </span>
              {#if typeof c === 'object' && 'song' in c}
                <select class="opt" title={t('song.columns')} value={c.columns ?? ''} onchange={(e) => (c.columns = e.currentTarget.value === '' ? undefined : e.currentTarget.value === 'auto' ? 'auto' : (Number(e.currentTarget.value) as 1 | 2))}>
                  <option value="">{t('book.colsBook')}</option>
                  <option value="auto">{t('opt.auto')}</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              {:else if typeof c === 'object' && 'page' in c}
                <label class="opt check"><input type="checkbox" bind:checked={c.page_number} /> {t('book.pageNumber')}</label>
              {/if}
              <button class="remove" title={t('book.remove')} aria-label={t('book.remove')} onclick={() => remove(i)}>✕</button>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="empty">{t('book.empty')}</p>
      {/if}

      <div class="add">
        <span class="heading">{t('list.add')}</span>
        <div class="add-row" style:--k="var(--k-song)">
          <select
            class="tinted"
            bind:value={addSong}
            onchange={() => {
              if (addSong) add({ song: rel(addSong) });
              addSong = '';
            }}>
            <option value="">{t('book.addSong')}</option>
            {#each files.filter((f) => isSong(f) && !included.has(f)) as f (f)}<option value={f}>{titles[f] ?? f}</option>{/each}
          </select>
          <button class="tinted" onclick={() => files.filter((f) => isSong(f) && !included.has(f)).forEach((f) => add({ song: rel(f) }))}>{t('book.addAll')}</button>
        </div>
        <div class="add-row" style:--k="var(--k-page)">
          <select
            class="tinted"
            bind:value={addPage}
            onchange={() => {
              addPageItem(addPage);
              addPage = '';
            }}>
            <option value="">{t('book.addPage')}</option>
            {#each files.filter(isPage) as f (f)}<option value={f}>{f.split('/').pop()!.replace(/\.page\.ya?ml$/i, '')}</option>{/each}
            {#each TEMPLATES as tp (tp.name)}<option value={'new:' + tp.name}>{t('book.newFromTemplate', { name: t(tp.label) })}</option>{/each}
          </select>
        </div>
        <div class="add-row" style:--k="var(--k-image)">
          <select
            class="tinted"
            bind:value={addImage}
            onchange={() => {
              if (addImage) add({ image: rel(addImage) });
              addImage = '';
            }}>
            <option value="">{t('book.addImage')}</option>
            {#each files.filter(isImage) as f (f)}<option value={f}>{f}</option>{/each}
          </select>
          <button
            class="tinted"
            onclick={async () => {
              const p = await importImage(workspace, files);
              if (!p) return;
              onfileschanged();
              add({ image: rel(p) });
            }}>{t('book.imageFromComputer')}</button>
        </div>
        <div class="add-row">
          <button class="tinted" style:--k="var(--k-toc)" onclick={() => add({ toc: t('book.indexTitle') })}>{t('book.addIndex')}</button>
          <button class="tinted" style:--k="var(--k-blank)" onclick={() => add('blank')}>{t('book.addBlank')}</button>
        </div>
      </div>
      {#if built?.warnings.length}
        <ul class="warnings">{#each built.warnings as w (w)}<li>{w}</li>{/each}</ul>
      {/if}
    </section>

    <Splitter name="book" min={[420, 380]} />

    <section class="preview-pane">
      <div class="toolbar">
        <label><input type="radio" bind:group={view} value="sheets" /> {t('book.sheets')}</label>
        <label><input type="radio" bind:group={view} value="pages" /> {t('book.pages')}</label>
        {#if built}<span class="info">{t('book.info', { pages: built.pages.length, sheets: built.sheets.length })}{book.imposition === 'booklet' ? t('book.duplex') : ''}</span>{/if}
        <span class="status">{status}</span>
        <button onclick={exportZip} title={t('book.zipHelp')}>{t('book.zip')}</button>
        <button class="primary" onclick={exportPdf} disabled={!built}>{t('opt.exportPdf')}</button>
      </div>
      <div class="preview-scroll">
        <Preview {sheets} imageUrl={(src) => images.get(src)} />
      </div>
    </section>
  </div>
{/if}

<style>
  .book-view {
    display: grid;
    grid-template-columns: minmax(420px, var(--edit, 1fr)) 0 minmax(380px, var(--preview, 1.2fr));
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
    padding: 14px 16px 24px;
    gap: 14px;
  }
  .title {
    font-size: 20px;
    font-weight: 600;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 10px;
  }
  input,
  select {
    font: inherit;
    padding: 3px 6px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
  }
  input[type='number'] {
    width: 4.5em;
  }
  /* Section titles: settings, contents, add. */
  .heading {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .summary {
    font-size: 12px;
    color: var(--muted);
  }

  /* Settings, in two groups; foldable. */
  .settings {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--sidebar);
  }
  .settings summary {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 9px 12px;
    cursor: pointer;
    list-style: none;
  }
  .settings summary::-webkit-details-marker {
    display: none;
  }
  .settings summary::before {
    content: '';
    align-self: center;
    width: 5px;
    height: 5px;
    margin: 0 2px;
    border-right: 1.5px solid var(--muted);
    border-bottom: 1.5px solid var(--muted);
    transform: rotate(-45deg);
    transition: transform 0.15s;
  }
  .settings[open] summary::before {
    transform: rotate(45deg);
  }
  .settings[open] .summary {
    display: none;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 12px 12px;
  }
  /* Controls flow in rows, at their natural width. */
  fieldset {
    margin: 0;
    padding: 8px 12px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 20px;
    font-size: 13px;
    min-width: 0;
  }
  legend {
    padding: 0 4px;
    font-weight: 600;
    font-size: 12px;
  }
  .row {
    gap: 6px;
    min-width: 0;
  }
  .row span {
    color: var(--muted);
  }
  .row select {
    min-width: 0;
    max-width: 100%;
  }
  .check {
    gap: 6px;
  }

  /* Contents: one card per item, striped with the hue of its kind. */
  .contents-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-top: 4px;
  }
  .contents {
    position: relative; /* item offsets for dragging (sortable.ts) */
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .contents li {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 40px;
    padding: 4px 8px 4px 2px;
    border: 1px solid var(--line);
    border-left: 4px solid var(--k);
    border-radius: 6px;
    background: var(--bg);
    font-size: 14px;
  }
  .contents li:hover {
    background: color-mix(in srgb, var(--k) 5%, var(--bg));
  }
  .contents:global(.sorting) > li:not(:global(.dragging)) {
    transition: transform 0.15s ease;
  }
  .contents li:global(.dragging) {
    position: relative;
    z-index: 1;
    background: color-mix(in srgb, var(--k) 10%, var(--bg));
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  }
  .page {
    flex: none;
    width: 1.8em;
    text-align: right;
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .kind {
    flex: none;
    padding: 1px 7px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--k) 16%, var(--bg));
    color: color-mix(in srgb, var(--k) 70%, var(--fg));
    font-size: 11px;
    font-weight: 600;
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .plain {
    color: var(--muted);
  }
  .opt {
    flex: none;
    font-size: 12px;
    color: var(--muted);
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
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--fg);
    cursor: pointer;
    font: inherit;
    text-align: left;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .link:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .inline {
    width: 100%;
    max-width: 16em;
    box-sizing: border-box;
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

  /* Adding: one row per kind, in its hue. */
  .add {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }
  .add-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .add-row select {
    flex: 1 1 14em;
    min-width: 0;
  }
  select.tinted {
    padding: 4px 8px;
    border-radius: 5px;
    border-color: color-mix(in srgb, var(--k) 55%, var(--line));
    background-color: color-mix(in srgb, var(--k) 8%, var(--bg));
    cursor: pointer;
  }
  .add .tinted {
    min-height: 30px;
  }
  .warnings {
    color: #b3261e;
    font-size: 13px;
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
  .info,
  .status {
    color: var(--muted);
    font-size: 12px;
  }
  .toolbar .primary {
    margin-left: auto;
  }
  .preview-scroll {
    overflow: auto;
    flex: 1;
    min-height: 0;
    background: var(--canvas);
  }
  /* Narrow editor area (phones, tablets, small windows): one pane at a time, switched from the top bar. */
  @container main (max-width: 900px) {
    .book-view {
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
  @container main (max-width: 520px) {
    .kind,
    .page {
      display: none;
    }
  }
</style>
