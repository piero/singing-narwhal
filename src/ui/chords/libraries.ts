// The workspace's chord libraries: the main one (chords.cho, there even before its file
// is written) and the others (chords/*.chords.cho), and the one songs pick diagrams from.

import { CHORD_LIBRARY, isChordLibrary, LIBRARY_EXT } from '../../core/chords/diagrams';
import { t } from '../app/i18n.svelte';

/** The main library first, then the others by name. */
export function chordLibraries(files: string[]): string[] {
  const others = files.filter((f) => isChordLibrary(f) && f !== CHORD_LIBRARY);
  return [CHORD_LIBRARY, ...others.sort((a, b) => libraryName(a).localeCompare(libraryName(b)))];
}

export function libraryName(path: string): string {
  if (path === CHORD_LIBRARY) return t('lib.main');
  const base = path.split('/').pop()!;
  return base.slice(0, base.length - LIBRARY_EXT.length);
}

// The library songs pick diagrams from, remembered between sessions.
const KEY = 'narwhal:songLibrary';

export function songLibrary(files: string[]): string {
  try {
    const p = localStorage.getItem(KEY);
    if (p && files.includes(p) && isChordLibrary(p)) return p;
  } catch {
    /* storage unavailable */
  }
  return CHORD_LIBRARY;
}

export function setSongLibrary(path: string) {
  try {
    localStorage.setItem(KEY, path);
  } catch {
    /* storage unavailable */
  }
}
