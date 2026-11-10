// The workspace's chord libraries (chords/*.chords.cho, and chords.cho at the top in older
// workspaces), and the one songs pick diagrams from. A workspace without any has the
// default one, the common guitar chords bundled with the app: it is listed at its path in
// chords/ before its file exists, and its file is written once it is changed or renamed.

import { isChordLibrary, LIBRARY_DIR, LIBRARY_EXT, OLD_LIBRARY, readLibrary } from '../../core/chords/diagrams';
import COMMON_GUITAR_CHORDS from './guitar.chords.cho?raw';
import { t } from '../app/i18n.svelte';
import type { Workspace } from '../workspace/workspace';

/** The common guitar chords, bundled with the app (a ChordPro file, as written by serializeLibrary). */
export { COMMON_GUITAR_CHORDS };

/** Where the default library goes: named in the language of the app when its file is written. */
export const defaultLibrary = () => LIBRARY_DIR + t('lib.default') + LIBRARY_EXT;

/** The libraries by name, or the default one when there are none. */
export function chordLibraries(files: string[]): string[] {
  const found = files.filter(isChordLibrary).sort((a, b) => libraryName(a).localeCompare(libraryName(b)));
  return found.length ? found : [defaultLibrary()];
}

/**
 * Where an imported library file goes: chords/ under its own name (chords.cho, the main
 * library exported by older versions, as the main library).
 */
export function importedLibraryPath(name: string): string {
  const base = name.split('/').pop()!;
  const stem = base.toLowerCase() === OLD_LIBRARY ? t('lib.main') : base.replace(/(\.chords)?\.[^.]+$/i, '');
  return LIBRARY_DIR + stem + LIBRARY_EXT;
}

export function libraryName(path: string): string {
  if (path === OLD_LIBRARY) return t('lib.main');
  const base = path.split('/').pop()!;
  return base.slice(0, base.length - LIBRARY_EXT.length);
}

/** A library's chords: the default one has the common guitar chords until its file exists. */
export function readChordLibrary(ws: Workspace, path: string) {
  return readLibrary((p) => ws.readText(p), path, path === defaultLibrary() ? COMMON_GUITAR_CHORDS : '');
}

/** Write the default library's file, if it has none yet. */
export async function writeDefaultLibrary(ws: Workspace, files: string[], path: string) {
  if (path === defaultLibrary() && !files.includes(path)) await ws.writeText(path, COMMON_GUITAR_CHORDS);
}

// The library songs pick diagrams from, remembered between sessions.
const KEY = 'narwhal:songLibrary';

export function songLibrary(files: string[]): string {
  const all = chordLibraries(files);
  try {
    const p = localStorage.getItem(KEY);
    if (p && all.includes(p)) return p;
  } catch {
    /* storage unavailable */
  }
  return all[0];
}

export function setSongLibrary(path: string) {
  try {
    localStorage.setItem(KEY, path);
  } catch {
    /* storage unavailable */
  }
}

/** Songs keep using a library after it is renamed. */
export function libraryRenamed(from: string, to: string) {
  try {
    if (localStorage.getItem(KEY) === from) localStorage.setItem(KEY, to);
  } catch {
    /* storage unavailable */
  }
}
