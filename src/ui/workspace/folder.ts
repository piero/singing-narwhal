// A folder on disk in Chromium browsers (File System Access API). Its handle is kept in
// IndexedDB, to reopen it next time and list it among the recent folders.

import { idbDelete, idbGet, idbPut, openDb } from './idb';
import { MAX_RECENT, RECENT_KEY, type Workspace } from './workspace';

export type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
  queryPermission?(o: object): Promise<PermissionState>;
  requestPermission?(o: object): Promise<PermissionState>;
};

export class BrowserFolderWorkspace implements Workspace {
  kind = 'folder' as const;
  constructor(readonly root: DirHandle) {}
  get name() {
    return this.root.name;
  }
  static supported() {
    return 'showDirectoryPicker' in window;
  }
  static async pick(): Promise<BrowserFolderWorkspace> {
    const h = await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite' });
    await rememberHandle(h);
    return new BrowserFolderWorkspace(h);
  }

  /** The folder used last time, if any. Browsers need the user's permission again to reopen it. */
  static async remembered(): Promise<DirHandle | null> {
    const db = await openDb();
    return (db && (await idbGet<DirHandle>(db, 'meta', 'folder').catch(() => undefined))) || null;
  }

  /** Reopen a remembered folder; `ask` shows the browser's permission prompt (needs a click). */
  static async reopen(h: DirHandle, ask: boolean): Promise<BrowserFolderWorkspace | null> {
    const o = { mode: 'readwrite' };
    let state = await h.queryPermission?.(o).catch(() => 'denied' as const);
    if (state !== 'granted' && ask) state = await h.requestPermission?.(o).catch(() => 'denied' as const);
    if (state !== 'granted') return null;
    await rememberHandle(h);
    return new BrowserFolderWorkspace(h);
  }

  /** Start in browser storage next time. */
  static async forget() {
    const db = await openDb();
    if (db) await idbDelete(db, 'meta', 'folder').catch(() => {});
  }
  async list() {
    const out: string[] = [];
    const walk = async (dir: DirHandle, prefix: string) => {
      for await (const h of dir.values()) {
        if (h.name.startsWith('.')) continue;
        if (h.kind === 'directory') await walk(h as DirHandle, prefix + h.name + '/');
        else out.push(prefix + h.name);
      }
    };
    await walk(this.root, '');
    return out.sort();
  }
  private async file(p: string, create = false): Promise<FileSystemFileHandle> {
    const parts = p.split('/');
    let dir: FileSystemDirectoryHandle = this.root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
    return dir.getFileHandle(parts[parts.length - 1], { create });
  }
  async readText(p: string) {
    return (await (await this.file(p)).getFile()).text();
  }
  async readBytes(p: string) {
    return new Uint8Array(await (await (await this.file(p)).getFile()).arrayBuffer());
  }
  async writeText(p: string, text: string) {
    const w = await (await this.file(p, true)).createWritable();
    await w.write(text);
    await w.close();
  }
  async writeBytes(p: string, data: Uint8Array) {
    const w = await (await this.file(p, true)).createWritable();
    await w.write(data as unknown as ArrayBuffer);
    await w.close();
  }
  private async exists(p: string) {
    try {
      await this.file(p);
      return true;
    } catch {
      return false;
    }
  }
  async remove(p: string) {
    const parts = p.split('/');
    let dir: FileSystemDirectoryHandle = this.root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    await dir.removeEntry(parts[parts.length - 1]);
  }
  async rename(from: string, to: string) {
    if (await this.exists(to)) throw new Error(`File exists: ${to}`);
    await this.writeBytes(to, await this.readBytes(from));
    await this.remove(from);
  }
}

// Recent folders' handles, in IndexedDB ("meta" store), most recent first.

export async function recentHandles(db: IDBDatabase): Promise<DirHandle[]> {
  return (await idbGet<DirHandle[]>(db, 'meta', RECENT_KEY).catch(() => undefined)) ?? [];
}

/** Handles in `list` other than `h`. */
export async function without(list: DirHandle[], h: DirHandle) {
  const out: DirHandle[] = [];
  for (const o of list) if (!(await o.isSameEntry(h).catch(() => false))) out.push(o);
  return out;
}

/** Reopen `h` next time, and put it first among the recent folders. */
async function rememberHandle(h: DirHandle) {
  const db = await openDb();
  if (!db) return;
  await idbPut(db, 'meta', 'folder', h).catch(() => {});
  await idbPut(db, 'meta', RECENT_KEY, [h, ...(await without(await recentHandles(db), h))].slice(0, MAX_RECENT)).catch(() => {});
}

export async function forgetHandle(h: DirHandle) {
  const db = await openDb();
  if (db) await idbPut(db, 'meta', RECENT_KEY, await without(await recentHandles(db), h)).catch(() => {});
}
