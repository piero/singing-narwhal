// Folders worked in before, most recent first, to switch between several of them. The
// desktop app keeps paths in its settings store (desktop.ts); browsers keep folder
// handles in IndexedDB (folder.ts) and ask for permission again when one is reopened.

import { t } from '../app/i18n.svelte';
import { forgetDir, recentDirs, rememberDir, tiny, TinyWorkspace } from './desktop';
import { BrowserFolderWorkspace, forgetHandle, recentHandles, without, type DirHandle } from './folder';
import { openDb } from './idb';
import type { Workspace } from './workspace';

export interface RecentFolder {
  name: string;
  /** Full path when known (the desktop app). */
  location?: string;
  /** Null if the browser's permission was refused. Call from a click: browsers ask for permission. */
  open(): Promise<Workspace | null>;
  forget(): Promise<void>;
}

/** Recent folders other than the current workspace and `skip` (a folder already offered for reopening). */
export async function recentFolders(current: Workspace, skip?: DirHandle | null): Promise<RecentFolder[]> {
  if (tiny()) {
    return (await recentDirs())
      .filter((dir) => dir !== current.location)
      .map((dir) => ({
        name: new TinyWorkspace(dir).name,
        location: dir,
        open: async () => {
          if (!(await tiny()!.api.call('isDir', { path: dir }).catch(() => false))) {
            await forgetDir(dir);
            throw new Error(t('ws.recentMissing', { path: dir }));
          }
          await rememberDir(dir);
          return new TinyWorkspace(dir);
        },
        forget: () => forgetDir(dir),
      }));
  }
  const db = BrowserFolderWorkspace.supported() && (await openDb());
  if (!db) return [];
  let list = await recentHandles(db);
  if (current instanceof BrowserFolderWorkspace) list = await without(list, current.root);
  if (skip) list = await without(list, skip);
  return list.map((h) => ({ name: h.name, open: () => BrowserFolderWorkspace.reopen(h, true), forget: () => forgetHandle(h) }));
}

/** Pick a folder on disk to work in, or null if cancelled / not supported. */
export async function pickFolder(): Promise<Workspace | null> {
  try {
    if (tiny()) return await TinyWorkspace.pick();
    if (BrowserFolderWorkspace.supported()) return await BrowserFolderWorkspace.pick();
  } catch (e) {
    if ((e as Error).name !== 'AbortError') throw e;
  }
  return null;
}
