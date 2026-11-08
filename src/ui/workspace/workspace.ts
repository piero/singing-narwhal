// Workspace: the folder holding a group's songs (.cho), songbooks (.songbook.yaml),
// pages, images and chord libraries. Implementations:
//
// - TinyWorkspace (desktop.ts): a folder on disk, through the desktop app's backend.
// - BrowserFolderWorkspace (folder.ts): a folder on disk, through the File System Access
//   API (Chromium browsers only).
// - BrowserWorkspace (browser.ts): the browser's storage (IndexedDB), empty on first use.
// - NoWorkspace (below): a placeholder until one of them is open.

import { isChordLibrary } from '../../core/chords/diagrams';
import type { FileLoader } from '../../core/songbook/songbook';

export interface Workspace extends FileLoader {
  name: string;
  /** Where the files are: 'browser' storage (not on disk) or a 'folder' on disk. */
  kind: 'browser' | 'folder';
  /** Full folder path when known (the desktop app); browsers only expose the name. */
  location?: string;
  /** Paths relative to the workspace root, using "/" separators. */
  list(): Promise<string[]>;
  writeText(path: string, text: string): Promise<void>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  /** Move a file; fails if the target exists. */
  rename(from: string, to: string): Promise<void>;
}

/** Chord libraries (chords.cho at the top, *.chords.cho) are ChordPro too, but not songs. */
export { isChordLibrary };
export const isSong = (p: string) => /\.(cho|chordpro|chopro|crd|pro)$/i.test(p) && !isChordLibrary(p);
export const isSongbook = (p: string) => /\.songbook\.ya?ml$/i.test(p);
export const isPage = (p: string) => /\.page\.ya?ml$/i.test(p);
export const isImage = (p: string) => /\.(png|jpe?g)$/i.test(p);

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Recent folders (recent.ts): how many are kept, and the key they are stored under. */
export const MAX_RECENT = 8;
export const RECENT_KEY = 'recentFolders';

/** Placeholder until the real workspace is open: lists nothing and refuses writes. */
export class NoWorkspace implements Workspace {
  name = '';
  kind = 'browser' as const;
  async list() {
    return [];
  }
  async readText(p: string): Promise<string> {
    throw new Error(`File not found: ${p}`);
  }
  async readBytes(p: string): Promise<Uint8Array> {
    throw new Error(`File not found: ${p}`);
  }
  async writeText() {
    throw new Error('No workspace open');
  }
  async writeBytes() {
    throw new Error('No workspace open');
  }
  async remove() {
    throw new Error('No workspace open');
  }
  async rename() {
    throw new Error('No workspace open');
  }
}

/** Copy every file of a workspace into another one (e.g. from the browser to a folder). */
export async function copyWorkspace(from: Workspace, to: Workspace): Promise<number> {
  const files = await from.list();
  for (const f of files) await to.writeBytes(f, await from.readBytes(f));
  return files.length;
}
