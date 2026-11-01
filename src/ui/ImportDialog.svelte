<script lang="ts">
  // The one way into the workspace from outside: single files (songs, pages, songbooks,
  // images, fonts), whole folders and .zip files, dropped or chosen, and pasted songs.
  // Songs written with chords above the lyrics are converted to ChordPro; an .odg becomes
  // a songbook with its own pages and songs. Single files go into songs/, pages/, images/
  // and fonts/; the files of a folder or .zip keep their paths, so its songbooks still find
  // their songs and pages. Nothing is written until Done: until then the converted songs
  // can be reviewed and edited, and Cancel discards them.
  import type { FontRegistry } from '../core/fonts';
  import { isFontFile } from '../core/fonts';
  import { IMPORTABLE, importFile, importText, slugify } from '../core/import';
  import { importOdg } from '../core/import/odg';
  import { pageImages, parsePage, serializePage } from '../core/pages';
  import { defaultSongbook, parseSongbook, resolveBookPath, serializeSongbook, songbookFiles, type ContentItem } from '../core/songbook';
  import { t } from './i18n.svelte';
  import { filesFromFolder, filesFromZip, isChordLibrary, isHidden, isImage, isPage, isSong, isSongbook, readExternalFiles, tiny, type Workspace } from './workspace';

  let { workspace, fonts, files, onclose }: { workspace: Workspace; fonts: FontRegistry; files: string[]; onclose: (opened?: string) => void } = $props();

  /**
   * A file waiting to be written: text (song, page, songbook; editable) or an image/font.
   * `replaces`: a file with this path is already in the workspace.
   */
  type Item = { source: string; path: string; text?: string; bytes?: Uint8Array; book?: number; replaces?: boolean };
  /** An imported .odg, kept to convert it again if its page order is changed. */
  type BookSource = { id: number; name: string; bytes: Uint8Array; booklet: boolean };

  let items: Item[] = $state([]);
  let books: BookSource[] = $state([]);
  /** Paths left out of the import, removed from the songbooks that list them. */
  const dropped = new Set<string>();
  let errors: string[] = $state([]);
  /** Files that the songbooks and pages to import use, but that neither they nor the workspace have. */
  let missing: string[] = $state([]);
  /** The song shown in the text box, or -1 when the box is for pasting a new song. */
  let selected = $state(-1);
  let pasted = $state('');
  let pastedTitle = $state('');
  let dragging = $state(false);
  let busy = $state(false);
  /** Paths reserved by the files waiting to be written. */
  const taken = new Set<string>();

  const current = $derived(items[selected]?.text !== undefined ? items[selected] : undefined);

  function unique(base: string, ext: string) {
    let name = `${base}${ext}`;
    for (let n = 2; taken.has(name) || files.includes(name); n++) name = `${base}-${n}${ext}`;
    taken.add(name);
    return name;
  }

  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

  function convert(name: string, bytes: Uint8Array): Item {
    const base = name.split('/').pop()!;
    const ext = base.slice(base.lastIndexOf('.')).toLowerCase();
    const stem = base.replace(/\.[^.]+$/, '');
    if (isImage(base)) return { source: base, path: unique(`images/${stem}`, ext), bytes };
    if (isFontFile(base)) return { source: base, path: unique(`fonts/${stem}`, ext), bytes };
    if (isSongbook(base)) return { source: base, path: unique(base.replace(/\.songbook\.ya?ml$/i, ''), '.songbook.yaml'), text: decode(bytes) };
    if (isPage(base)) return { source: base, path: unique(`pages/${base.replace(/\.page\.ya?ml$/i, '')}`, '.page.yaml'), text: decode(bytes) };
    // A chord library replaces the workspace's.
    if (isChordLibrary(base)) {
      taken.add(base);
      return { source: base, path: base, text: decode(bytes), replaces: files.includes(base) };
    }
    if (!IMPORTABLE.test(base)) throw new Error('unsupported file type');
    const song = importFile(base, bytes, fonts);
    return { source: base, path: unique(`songs/${slugify(song.title)}`, '.cho'), text: song.chordpro };
  }

  /** A GIF (or other picture the PDF cannot embed) converted to PNG by the browser. */
  async function toPng(bytes: Uint8Array, type: string): Promise<Uint8Array> {
    const bmp = await createImageBitmap(new Blob([bytes as unknown as ArrayBuffer], { type }));
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('cannot convert the picture');
    return new Uint8Array(await blob.arrayBuffer());
  }

  /** Add an .odg songbook: a songbook file, its pages and songs, and the pictures of its pages. */
  async function addBook(src: BookSource) {
    const book = importOdg(src.name, src.bytes, fonts, { booklet: src.booklet });
    const stem = slugify(book.title);
    const pictures: Item[] = [];
    const picturePath: Record<string, string> = {};
    let n = 1;
    for (const [href, bytes] of Object.entries(book.images)) {
      const ext = href.slice(href.lastIndexOf('.')).toLowerCase();
      try {
        const png = !/^\.(png|jpe?g)$/.test(ext);
        const data = png ? await toPng(bytes, `image/${ext.slice(1)}`) : bytes;
        const path = unique(`images/${stem}-${n++}`, png ? '.png' : ext);
        picturePath[href] = path;
        pictures.push({ source: src.name, path, bytes: data, book: src.id });
      } catch (e) {
        errors.push(t('import.error', { file: `${src.name}: ${href}`, msg: (e as Error).message }));
      }
    }
    const parts: Item[] = [];
    const contents: ContentItem[] = [];
    for (const part of book.parts) {
      const source = t('import.bookPage', { name: src.name, page: part.page });
      if (part.kind === 'blank') contents.push('blank');
      else if (part.kind === 'song') {
        const path = unique(`songs/${slugify(part.title)}`, '.cho');
        parts.push({ source, path, text: part.chordpro, book: src.id });
        contents.push({ song: path });
      } else {
        for (const el of part.doc.elements) if ('image' in el) el.image = picturePath[el.image] ?? el.image;
        const path = unique(`pages/${part.name}`, '.page.yaml');
        parts.push({ source, path, text: serializePage(part.doc), book: src.id });
        contents.push({ page: path });
      }
    }
    const songbook = { ...defaultSongbook(), title: book.title, page: book.pageSize, imposition: 'booklet' as const, contents };
    const path = unique(book.title.replace(/[/\\:]/g, '-'), '.songbook.yaml');
    items.push({ source: src.name, path, text: serializeSongbook(songbook), book: src.id }, ...parts, ...pictures);
    selected = items.length - parts.length - pictures.length - 1;
  }

  /** Convert an .odg again with the other page order, replacing what it added. */
  async function toggleBooklet(src: BookSource) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].book !== src.id) continue;
      taken.delete(items[i].path);
      items.splice(i, 1);
    }
    selected = -1;
    src.booklet = !src.booklet;
    await addBook(src);
  }

  /**
   * The files of a folder or .zip (`name`): songs, pages, songbooks, images and fonts keep
   * their paths, replacing files with the same path; other files are converted or skipped.
   */
  async function addProject(name: string, entries: [string, Uint8Array][]) {
    const other: { name: string; bytes: Uint8Array }[] = [];
    let skipped = 0;
    for (const [path, bytes] of entries) {
      if (isHidden(path)) continue;
      if (isSong(path) || isSongbook(path) || isPage(path) || isChordLibrary(path) || isImage(path) || isFontFile(path)) {
        const text = isImage(path) || isFontFile(path) ? undefined : decode(bytes);
        const i = items.findIndex((it) => it.path === path);
        if (i >= 0) items.splice(i, 1);
        taken.add(path);
        items.push({ source: `${name}/${path}`, path, text, bytes: text === undefined ? bytes : undefined, replaces: files.includes(path) });
      } else if (/\.odg$/i.test(path) || IMPORTABLE.test(path)) other.push({ name: path, bytes });
      else skipped++;
    }
    await add(other);
    if (skipped) errors.push(t('import.skipped', { name, n: skipped }));
    if (!entries.length) errors.push(t('import.empty', { name }));
  }

  async function add(list: { name: string; bytes: Uint8Array }[]) {
    for (const it of list) {
      try {
        if (/\.zip$/i.test(it.name)) {
          await addProject(it.name.replace(/\.zip$/i, ''), filesFromZip(it.bytes));
          continue;
        }
        if (/\.odg$/i.test(it.name)) {
          const src = { id: books.length, name: it.name.split('/').pop()!, bytes: it.bytes, booklet: true };
          books.push(src);
          await addBook(books[books.length - 1]);
          continue;
        }
        items.push(convert(it.name, it.bytes));
        // Show the last song added.
        if (items[items.length - 1].text !== undefined) selected = items.length - 1;
      } catch (e) {
        errors.push(t('import.error', { file: it.name, msg: (e as Error).message }));
      }
    }
    await checkReferences();
  }

  async function checkReferences() {
    const have = new Set([...files, ...items.map((it) => it.path)]);
    const readText = async (p: string) => items.find((it) => it.path === p)?.text ?? workspace.readText(p);
    const out = new Set<string>();
    for (const it of items) {
      if (it.text === undefined) continue;
      try {
        if (isSongbook(it.path)) for (const p of (await songbookFiles(it.path, [...have], readText)).missing) out.add(p);
        // Paths in a page are relative to the songbook that shows it; check from the top folder.
        else if (isPage(it.path)) for (const src of pageImages(parsePage(it.text))) if (!have.has(resolveBookPath('', src))) out.add(src);
      } catch {
        // Not valid YAML: the editor reports it once the file is opened.
      }
    }
    missing = [...out].sort();
  }

  /** Files given from outside the dialog (e.g. opened with the desktop app from Finder). */
  export async function addFiles(list: { name: string; bytes: Uint8Array }[]) {
    await add(list);
  }

  const readAll = (list: File[]) => Promise.all(list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));

  async function pick() {
    if (tiny()) {
      await add(await readExternalFiles());
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.odt,.odg,.txt,.cho,.chordpro,.chopro,.crd,.yaml,.yml,.png,.jpg,.jpeg,.ttf,.otf,.zip';
    input.onchange = async () => add(await readAll([...(input.files ?? [])]));
    input.click();
  }

  async function pickFolder() {
    try {
      const r = await filesFromFolder();
      if (r) await addProject(r.name, r.entries);
    } catch (e) {
      errors.push(t('import.error', { file: '', msg: (e as Error).message }));
    }
  }

  /** All files under a dropped folder, at their paths inside it. */
  async function readEntry(dir: FileSystemDirectoryEntry, prefix = ''): Promise<[string, Uint8Array][]> {
    const reader = dir.createReader();
    const out: [string, Uint8Array][] = [];
    // readEntries returns the entries in batches, until an empty one.
    for (let batch; (batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail))).length; ) {
      for (const e of batch) {
        if (e.name.startsWith('.')) continue;
        if (e.isDirectory) out.push(...(await readEntry(e as FileSystemDirectoryEntry, prefix + e.name + '/')));
        else {
          const f = await new Promise<File>((ok, fail) => (e as FileSystemFileEntry).file(ok, fail));
          out.push([prefix + e.name, new Uint8Array(await f.arrayBuffer())]);
        }
      }
    }
    return out;
  }

  async function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    // Entries must be taken before the first await: the drop data is cleared afterwards.
    const entries = [...(e.dataTransfer?.items ?? [])].map((it) => it.webkitGetAsEntry?.());
    const list = [...(e.dataTransfer?.files ?? [])];
    const single: File[] = [];
    for (const [i, f] of list.entries()) {
      const entry = entries[i];
      if (entry?.isDirectory) await addProject(entry.name, await readEntry(entry as FileSystemDirectoryEntry));
      else single.push(f);
    }
    await add(await readAll(single));
  }

  function addPasted() {
    if (!pasted.trim()) return;
    const song = importText(pasted, pastedTitle || t('prompt.songTitleDefault'));
    items.push({ source: t('import.pastedSource'), path: unique(`songs/${slugify(song.title)}`, '.cho'), text: song.chordpro });
    selected = items.length - 1;
    pasted = '';
    pastedTitle = '';
  }

  function removeItem(i: number) {
    taken.delete(items[i].path);
    dropped.add(items[i].path);
    items.splice(i, 1);
    if (selected === i) selected = -1;
    else if (selected > i) selected--;
    checkReferences();
  }

  async function done() {
    // Pasted text that was not added yet is imported too, rather than lost.
    addPasted();
    busy = true;
    let opened: string | undefined;
    while (items.length) {
      const it = items[0];
      try {
        if (it.text !== undefined && it.path.endsWith('.songbook.yaml')) {
          await workspace.writeText(it.path, withoutDropped(it.text));
          opened = it.path;
        } else if (it.text !== undefined) {
          await workspace.writeText(it.path, it.text);
          if (!opened?.endsWith('.songbook.yaml')) opened = it.path;
        } else await workspace.writeBytes(it.path, it.bytes!);
      } catch (e) {
        // Keep the dialog open with the files not written yet.
        errors.push(t('import.error', { file: it.path, msg: (e as Error).message }));
        busy = false;
        selected = -1;
        return;
      }
      items.shift();
    }
    onclose(opened);
  }

  /** A songbook without the files left out of the import. */
  function withoutDropped(text: string): string {
    if (!dropped.size) return text;
    try {
      const book = parseSongbook(text);
      book.contents = book.contents.filter((c) => typeof c !== 'object' || !dropped.has(('song' in c && c.song) || ('page' in c && c.page) || ('image' in c && c.image) || ''));
      return serializeSongbook(book);
    } catch {
      return text;
    }
  }

  const cancel = () => onclose();
  const pending = $derived(items.length > 0 || pasted.trim() !== '');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !busy && cancel()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && !pending && cancel()}>
  <div
    class="dialog"
    class:dragging
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={drop}
  >
    <h2>{t('import.title')}</h2>
    <div class="choose">
      <button class="primary" onclick={pick} disabled={busy}>{t('import.files')}</button>
      <button class="primary" onclick={pickFolder} disabled={busy}>{t('import.folder')}</button>
    </div>
    <p class="help">{t('import.filesHelp')}</p>
    <p class="help">{t('import.folderHelp')}</p>
    <p class="where">{t('import.where', { where: workspace.kind === 'browser' ? t('where.browser') : t('where.folder', { name: workspace.location ?? workspace.name }) })}</p>

    {#if current}
      <h3>{t('import.review', { name: current.source, path: current.path })}</h3>
      <textarea bind:value={current.text} rows="14" spellcheck="false"></textarea>
      <button onclick={() => (selected = -1)}>+ {t('import.pasteAnother')}</button>
    {:else}
      <h3>{t('import.paste')}</h3>
      <input placeholder={t('import.pasteName')} bind:value={pastedTitle} />
      <textarea bind:value={pasted} rows="10" spellcheck="false" placeholder={'      C          G\nThere was a king who ruled the land'}></textarea>
      <button onclick={addPasted} disabled={!pasted.trim()}>{t('import.convert')}</button>
    {/if}

    {#if items.length}
      <h3>{t('import.pending')}</h3>
      <ul class="items">
        {#each items as it, i (it.path)}
          <li class:selected={i === selected}>
            {#if it.text !== undefined}
              <button class="item" title={t('import.show')} onclick={() => (selected = i)}>{it.source} → {it.path}</button>
            {:else}
              <span class="item">{it.source} → {it.path}</span>
            {/if}
            {#if it.replaces}<span class="replaces">{t('import.replaces')}</span>{/if}
            <button class="remove" title={t('import.remove')} onclick={() => removeItem(i)}>✕</button>
          </li>
        {/each}
      </ul>
      {#each books as b (b.id)}
        {#if items.some((it) => it.book === b.id)}
          <label class="help"><input type="checkbox" checked={b.booklet} disabled={busy} onchange={() => toggleBooklet(b)} /> {t('import.booklet', { name: b.name })}</label>
        {/if}
      {/each}
      <p class="help">{t('import.pendingHelp')}</p>
      {#if missing.length}
        <p class="warn">{t('import.missing', { list: missing.slice(0, 5).join(', ') + (missing.length > 5 ? ' …' : ''), n: missing.length })}</p>
      {/if}
    {/if}
    {#if errors.length}
      <ul class="log">{#each errors as m, i (i)}<li>{m}</li>{/each}</ul>
    {/if}
    <div class="footer">
      <button onclick={cancel} disabled={busy}>{t('import.cancel')}</button>
      <button class="primary" onclick={done} disabled={busy}>{t('import.ok')}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .dialog {
    background: var(--bg);
    color: var(--fg);
    border-radius: 10px;
    padding: 20px 24px;
    width: min(640px, 92vw);
    max-height: 90vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    border: 2px solid transparent;
  }
  .dialog.dragging {
    border-color: var(--accent);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  h3 {
    margin: 12px 0 0;
    font-size: 14px;
  }
  .help {
    font-size: 12px;
    color: var(--muted);
    margin: 0;
  }
  input,
  textarea {
    font: inherit;
    padding: 4px 6px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
  }
  textarea {
    font: 13px/1.35 ui-monospace, Menlo, monospace;
  }
  button {
    align-self: flex-start;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    border-radius: 5px;
    padding: 4px 12px;
    cursor: pointer;
  }
  button.primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .where {
    font-size: 12px;
    margin: 0;
    padding: 6px 8px;
    border-radius: 5px;
    background: var(--chip-hover);
  }
  .log {
    font-size: 12px;
    color: var(--muted);
    max-height: 160px;
    overflow: auto;
    margin: 4px 0;
    padding-left: 18px;
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 5px;
    max-height: 160px;
    overflow: auto;
    font-size: 13px;
  }
  .items li {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--line);
  }
  .items li:last-child {
    border-bottom: none;
  }
  .items li.selected {
    background: var(--line-focus);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .items .item {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 5px 8px;
    border: none;
    border-radius: 0;
    background: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .items .replaces {
    flex-shrink: 0;
    font-size: 11px;
    color: #b06000;
  }
  .choose {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .warn {
    font-size: 12px;
    margin: 0;
    color: #b06000;
  }
  .items .remove {
    align-self: center;
    border: none;
    background: none;
    color: var(--muted);
    padding: 2px 8px;
  }
  .log {
    color: #b3261e;
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
</style>
