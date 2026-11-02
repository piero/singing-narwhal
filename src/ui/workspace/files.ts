// Files going in and out of the workspace: picking files and folders on the computer,
// saving a file ("Save as…"), reading and making .zip files.

import { unzipSync, zipSync } from 'fflate';
import { songbookFiles } from '../../core/songbook/songbook';
import { readExternalFiles, tiny, TinyWorkspace } from './desktop';
import { isImage, toBase64, type Workspace } from './workspace';

/** Let the user pick files from their computer: native dialog in the app, file input in the browser. */
export async function pickLocalFiles(types: string[], multiple = false): Promise<{ name: string; bytes: Uint8Array }[]> {
  if (tiny()) return (await readExternalFiles(types)).slice(0, multiple ? undefined : 1);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    input.accept = types.map((x) => '.' + x).join(',');
    input.onchange = async () =>
      resolve(await Promise.all([...(input.files ?? [])].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/**
 * Copy an image chosen from the computer into the workspace's images/ folder, or reuse an
 * identical one already there. Returns its path, or null if cancelled.
 */
export async function importImage(ws: Workspace, files: string[]): Promise<string | null> {
  const [f] = await pickLocalFiles(['png', 'jpg', 'jpeg']);
  if (!f) return null;
  const dot = f.name.lastIndexOf('.');
  const base = 'images/' + f.name.slice(0, dot).replace(/[/\\:]/g, '-');
  const ext = f.name.slice(dot).toLowerCase();
  // Reuse an identical image already in the workspace, whatever its name.
  const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
  const candidates = files.filter(isImage).sort((a, b) => Number(!a.startsWith(base)) - Number(!b.startsWith(base)));
  for (const c of candidates) {
    try {
      if (same(await ws.readBytes(c), f.bytes)) return c;
    } catch {
      /* unreadable: not a match */
    }
  }
  let p = base + ext;
  for (let n = 2; files.includes(p); n++) p = `${base}-${n}${ext}`;
  await ws.writeBytes(p, f.bytes);
  return p;
}

/**
 * Save a file chosen by the user ("Save as…"): native dialog in the desktop app
 * and in Chromium browsers, a download elsewhere. Returns false if cancelled.
 */
export async function saveFile(name: string, data: Uint8Array, mime: string): Promise<boolean> {
  const t = tiny();
  if (t) {
    // The native panel takes no suggested name; the type makes macOS add the extension.
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
    const path = await t.dialog.saveFile(ext ? { types: [ext] } : {});
    if (!path) return false;
    await t.api.call('writeAbsolute', { path, data: toBase64(data) });
    return true;
  }
  const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name });
      const w = await handle.createWritable();
      await w.write(data as unknown as ArrayBuffer);
      await w.close();
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      throw e;
    }
  }
  const url = URL.createObjectURL(new Blob([data as unknown as ArrayBuffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/**
 * The files of a .zip (a backup, or a zipped songbook folder) at their paths in the zip,
 * without dotfiles and __MACOSX. A zip of a whole folder (as made by the Finder) has that
 * folder as its only top-level entry, which is dropped.
 */
export function filesFromZip(bytes: Uint8Array): [string, Uint8Array][] {
  let entries = Object.entries(unzipSync(bytes)).filter(([p]) => !p.endsWith('/') && !isHidden(p));
  const tops = new Set(entries.map(([p]) => p.split('/')[0]));
  if (tops.size === 1 && entries.every(([p]) => p.includes('/'))) {
    const top = [...tops][0].length + 1;
    entries = entries.map(([p, b]) => [p.slice(top), b]);
  }
  return entries;
}

export const isHidden = (p: string) => p.split('/').some((part) => part.startsWith('.') || part === '__MACOSX');

/**
 * Pick a folder (e.g. a songbook with its songs and pages) and read all its files, at their
 * paths inside the folder, without dotfiles. Null if cancelled.
 */
export async function filesFromFolder(): Promise<{ name: string; entries: [string, Uint8Array][] } | null> {
  if (tiny()) {
    const dir = await tiny()!.dialog.pickFolder();
    if (!dir) return null;
    const src = new TinyWorkspace(dir);
    const paths = (await src.list()).filter((p) => !isHidden(p));
    return { name: src.name, entries: await Promise.all(paths.map(async (p): Promise<[string, Uint8Array]> => [p, await src.readBytes(p)])) };
  }
  // A folder input works in every browser, also those without the File System Access API.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.onchange = async () => {
      const picked = [...(input.files ?? [])];
      // Paths start with the picked folder's name: "Folder/songs/a.cho".
      const name = picked[0]?.webkitRelativePath.split('/')[0] ?? '';
      const files = picked.map((f): [string, File] => [f.webkitRelativePath.slice(name.length + 1), f]).filter(([p]) => !isHidden(p));
      resolve({ name, entries: await Promise.all(files.map(async ([p, f]): Promise<[string, Uint8Array]> => [p, new Uint8Array(await f.arrayBuffer())])) });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** The whole workspace as a .zip file. */
export async function zipWorkspace(ws: Workspace): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  for (const f of await ws.list()) entries[f] = await ws.readBytes(f);
  return zipSync(entries);
}

/**
 * One songbook and the files it uses, zipped with their workspace paths (so "Open a .zip…"
 * puts them back in place). `missing`: files the songbook lists but the workspace lacks.
 */
export async function zipSongbook(ws: Workspace, path: string): Promise<{ zip: Uint8Array; missing: string[] }> {
  const { files, missing } = await songbookFiles(path, await ws.list(), (p) => ws.readText(p));
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f] = await ws.readBytes(f);
  return { zip: zipSync(entries), missing };
}
