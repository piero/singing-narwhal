// Song-wide chord edits: transposing and converting between notations.
// These change the song itself (what the editor shows and what is saved).

import { getMeta, setMeta, type SongDoc } from './chordpro';
import { chordNotation, guessKey, parseChord, renderChord, spellingForKey, type Notation } from '../chords/chords';
import { findShape, formatDefine, parseDefine, type ChordShape } from '../chords/diagrams';

function mapChords(doc: SongDoc, fn: (chord: string) => string): SongDoc {
  return {
    lines: doc.lines.map((l) => (l.kind === 'lyrics' && l.chords.length ? { ...l, chords: l.chords.map((c) => ({ ...c, chord: fn(c.chord) })) } : l)),
  };
}

/**
 * The song's key: its {key} if it has one, otherwise guessed from the chords (and
 * not written to the song unless the user types it).
 */
export function songKey(doc: SongDoc): { key: string | null; guessed: boolean } {
  const key = getMeta(doc, 'key');
  if (key) return { key, guessed: false };
  const chords = doc.lines.flatMap((l) => (l.kind === 'lyrics' ? l.chords.map((c) => c.chord) : []));
  return { key: guessKey(chords), guessed: true };
}

/** Rename the chords of the song's diagrams ({define}), keeping the rest of each definition. */
function mapDefines(doc: SongDoc, fn: (name: string) => string): SongDoc {
  return {
    lines: doc.lines.map((l) => {
      if (l.kind !== 'directive' || l.name !== 'define') return l;
      const name = /^\s*(\S+)/.exec(l.value)?.[1];
      return name ? { ...l, value: l.value.replace(name, fn(name)) } : l;
    }),
  };
}

/**
 * Transpose all chords (and the key) by a number of semitones. A fingering can't be
 * transposed, so each diagram becomes the library's diagram of the new chord, when the
 * library has one; otherwise it is kept as it was.
 */
export function transposeSong(doc: SongDoc, semitones: number, library: ChordShape[] = []): SongDoc {
  if (semitones % 12 === 0) return doc;
  const key = getMeta(doc, 'key');
  // Without a {key}, sharps or flats follow the guessed key.
  const spelling = spellingForKey(songKey(doc).key ?? undefined, semitones);
  const opts = { notation: 'original' as const, transpose: semitones, spelling };
  let out = mapChords(doc, (c) => renderChord(c, opts));
  if (key && parseChord(key)) out = setMeta(out, 'key', renderChord(key, opts));
  out = {
    lines: out.lines.map((l) => {
      const shape = l.kind === 'directive' && l.name === 'define' ? parseDefine(l.value) : null;
      if (!shape) return l;
      const name = renderChord(shape.name, opts);
      const found = findShape(library, name);
      return found ? { ...l, value: formatDefine({ ...found, name }) } : l;
    }),
  };
  return out;
}

/** Rewrite all chords (and the key) in the given notation. */
export function convertNotation(doc: SongDoc, notation: Notation): SongDoc {
  const opts = { notation, transpose: 0 };
  let out = mapDefines(mapChords(doc, (c) => renderChord(c, opts)), (c) => renderChord(c, opts));
  const key = getMeta(doc, 'key');
  if (key && parseChord(key)) out = setMeta(out, 'key', renderChord(key, opts));
  return out;
}

/** Notation used by most chords of the song, or null if it has no chords. */
export function songNotation(doc: SongDoc): Notation | null {
  let it = 0;
  let en = 0;
  for (const l of doc.lines) {
    if (l.kind !== 'lyrics') continue;
    for (const c of l.chords) {
      if (!parseChord(c.chord)) continue;
      if (chordNotation(c.chord) === 'italian') it++;
      else en++;
    }
  }
  return it + en === 0 ? null : it >= en ? 'italian' : 'english';
}
