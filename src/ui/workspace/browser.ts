// Files kept in the browser's storage (IndexedDB), with the backup reminder's state.

import { t } from '../app/i18n.svelte';
import { idbDelete, idbEntries, idbGet, idbPut, idbPutAll, openDb } from './idb';
import { fromBase64, type Workspace } from './workspace';

// Earlier versions kept files in localStorage; they are moved to IndexedDB once.
const LEGACY_FILE = 'narwhal:file:';
const LEGACY_DELETED = 'narwhal:deleted:';

export interface BackupState {
  /** Time of the last change to the files (ms), 0 if never changed. */
  lastChange: number;
  /** Time of the last backup (.zip download or copy to a folder), 0 if never. */
  lastBackup: number;
}

function legacyFiles(): Map<string, Uint8Array> | null {
  const files = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  let found = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      const v = localStorage.getItem(key) ?? '';
      if (key.startsWith(LEGACY_FILE)) {
        found = true;
        const bytes = v.startsWith('data:') ? fromBase64(v.slice(v.indexOf(',') + 1)) : new TextEncoder().encode(v);
        files.set(key.slice(LEGACY_FILE.length), bytes);
      } else if (key.startsWith(LEGACY_DELETED)) {
        found = true;
        deleted.push(key.slice(LEGACY_DELETED.length));
      }
    }
  } catch {
    return null;
  }
  if (!found) return null;
  for (const p of deleted) files.delete(p);
  return files;
}

function clearLegacy() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)!);
    for (const k of keys) if (k.startsWith(LEGACY_FILE) || k.startsWith(LEGACY_DELETED)) localStorage.removeItem(k);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Files kept in the browser (IndexedDB); empty on first use.
 * Writes resolve only once stored, and throw if the browser refuses them (e.g. no space).
 * Without IndexedDB, files live in memory only (`persistent` is false).
 */
export class BrowserWorkspace implements Workspace {
  kind = 'browser' as const;
  persistent: boolean;
  backup: BackupState = { lastChange: 0, lastBackup: 0 };
  /** Called after each change, with the new backup state. */
  onchange?: (b: BackupState) => void;
  /** Whether the browser has agreed not to clear these files when space runs low. */
  storageProtected = false;
  /** Called when the browser grants that protection. */
  onprotected?: () => void;
  private askedPersist = false;

  private constructor(
    private db: IDBDatabase | null,
    private files: Map<string, Uint8Array>,
  ) {
    this.persistent = !!db;
  }

  get name() {
    return t('ws.browserName');
  }

  /** Open the browser's storage; `step` is told what is being waited for (to report a hang). */
  static async open(step: (name: string) => void = () => {}): Promise<BrowserWorkspace> {
    step('indexedDB.open');
    const db = await openDb();
    if (!db) {
      return new BrowserWorkspace(null, legacyFiles() ?? new Map());
    }
    step('indexedDB read');
    if (!(await idbGet(db, 'meta', 'seeded'))) {
      await idbPutAll(db, 'files', [...(legacyFiles() ?? [])]);
      await idbPut(db, 'meta', 'seeded', true);
      clearLegacy();
    }
    const ws = new BrowserWorkspace(db, new Map(await idbEntries<Uint8Array>(db, 'files')));
    ws.backup = (await idbGet<BackupState>(db, 'meta', 'backup')) ?? ws.backup;
    // Asked in the background: startup must not wait for the browser's answer.
    navigator.storage
      ?.persisted?.()
      .then((granted) => {
        if (!granted || ws.storageProtected) return;
        ws.storageProtected = true;
        ws.onprotected?.();
      })
      .catch(() => {});
    return ws;
  }

  /** Files kept in memory only, for when the browser's storage does not respond. */
  static memory(): BrowserWorkspace {
    return new BrowserWorkspace(null, new Map());
  }

  async list() {
    return [...this.files.keys()].sort();
  }
  private get(p: string) {
    const b = this.files.get(p);
    if (b === undefined) throw new Error(`File not found: ${p}`);
    return b;
  }
  async readText(p: string) {
    return new TextDecoder().decode(this.get(p));
  }
  async readBytes(p: string) {
    return this.get(p);
  }

  private async changed() {
    this.backup = { ...this.backup, lastChange: Date.now() };
    if (this.db) await idbPut(this.db, 'meta', 'backup', this.backup).catch(() => {});
    this.onchange?.(this.backup);
    // Ask the browser not to clear these files when space runs low (granted silently or not at all,
    // except Firefox, which asks the user once).
    if (!this.askedPersist && this.db && !this.storageProtected) {
      this.askedPersist = true;
      navigator.storage
        ?.persist?.()
        .then((granted) => {
          if (!granted) return;
          this.storageProtected = true;
          this.onprotected?.();
        })
        .catch(() => {});
    }
  }

  async markBackedUp() {
    this.backup = { ...this.backup, lastBackup: Date.now() };
    if (this.db) await idbPut(this.db, 'meta', 'backup', this.backup).catch(() => {});
    this.onchange?.(this.backup);
  }

  async writeBytes(p: string, data: Uint8Array) {
    const copy = data.slice();
    if (this.db) await idbPut(this.db, 'files', p, copy);
    this.files.set(p, copy);
    await this.changed();
  }
  async writeText(p: string, text: string) {
    await this.writeBytes(p, new TextEncoder().encode(text));
  }
  async remove(p: string) {
    if (this.db) await idbDelete(this.db, 'files', p);
    this.files.delete(p);
    await this.changed();
  }
  async rename(from: string, to: string) {
    const v = this.get(from);
    if (this.files.has(to)) throw new Error(`File exists: ${to}`);
    await this.writeBytes(to, v);
    await this.remove(from);
  }
}
