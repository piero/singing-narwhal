// Chord model: parsing (English and Italian names), transposition and rendering.
//
// A chord is stored as written in the source file. Converting notation and
// transposing are edits of the song (see song/transform.ts); a songbook may also ask to
// print all chords in one notation. Chords that cannot be parsed (e.g. "N.C.",
// "|", "(2x)") are always kept verbatim.

export type Notation = 'english' | 'italian';

export interface Note {
  /** Pitch class, 0 = C. */
  pc: number;
  /** Letter index 0..6 = C D E F G A B, used to keep the original spelling. */
  letter: number;
  /** -1 flat, 0 natural, +1 sharp. */
  accidental: number;
}

export interface Chord {
  root: Note;
  minor: boolean;
  /** How the minor was written: "m" (Am, Lam), "-" (A-, La-) or "min". */
  minorMark?: string;
  /** Everything after the root and the minor marker, e.g. "7", "maj7", "sus4", "(addB)". */
  suffix: string;
  bass?: Note;
}

const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ENGLISH = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ITALIAN = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

// Italian names first: "Do" must not be read as "D" + "o", and "Sol" before "Si".
const NOTE_RE = /^(Do|Re|Mi|Fa|Sol|La|Si|[A-G])(#|♯|b|♭)?/i;

function parseNote(s: string): { note: Note; rest: string } | null {
  const m = NOTE_RE.exec(s);
  if (!m) return null;
  const name = m[1];
  let letter: number;
  if (name.length === 1) {
    // Single letters are English names; must be upper case to avoid matching
    // words such as "b" or "a".
    if (name !== name.toUpperCase()) return null;
    letter = ENGLISH.indexOf(name);
  } else {
    const norm = name[0].toUpperCase() + name.slice(1).toLowerCase();
    letter = ITALIAN.indexOf(norm);
    if (letter < 0) return null;
  }
  const accidental = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  const pc = (LETTER_PC[letter] + accidental + 12) % 12;
  return { note: { pc, letter, accidental }, rest: s.slice(m[0].length) };
}

// "min" before "m", which would leave "in" behind (Amin7).
const MINOR_RE = /^(min|m(?!aj)|-|–|−)/;

export function parseChord(text: string): Chord | null {
  const s = text.trim();
  const head = parseNote(s);
  if (!head) return null;
  let rest = head.rest;
  let minor = false;
  let minorMark: string | undefined;
  const mm = MINOR_RE.exec(rest);
  if (mm) {
    minor = true;
    minorMark = /^[–−]$/.test(mm[0]) ? '-' : mm[0];
    rest = rest.slice(mm[0].length);
  }
  let bass: Note | undefined;
  const slash = rest.lastIndexOf('/');
  if (slash >= 0) {
    const b = parseNote(rest.slice(slash + 1));
    if (b && b.rest.trim() === '') {
      bass = b.note;
      rest = rest.slice(0, slash);
    }
  }
  // Reject things that merely start with a note name, e.g. "Rit." or "Intro".
  if (/^[a-z]{2,}/i.test(rest) && !/^(maj|min|sus|add|dim|aug|m)/i.test(rest)) return null;
  return { root: head.note, minor, minorMark, suffix: rest, bass };
}

// Spelling used when transposing: which accidental to prefer for each pitch class.
const SHARP_SPELLING: [number, number][] = [
  [0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0],
];
const FLAT_SPELLING: [number, number][] = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];
// Neutral default: the most common spelling of each black key in guitar songbooks.
const MIXED_SPELLING: [number, number][] = [
  [0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];

export type Spelling = 'sharp' | 'flat' | 'auto';

function transposeNote(n: Note, semitones: number, spelling: Spelling): Note {
  if (semitones % 12 === 0) return n;
  const pc = (((n.pc + semitones) % 12) + 12) % 12;
  const table = spelling === 'sharp' ? SHARP_SPELLING : spelling === 'flat' ? FLAT_SPELLING : MIXED_SPELLING;
  const [letter, accidental] = table[pc];
  return { pc, letter, accidental };
}

export function transposeChord(c: Chord, semitones: number, spelling: Spelling = 'auto'): Chord {
  return {
    ...c,
    root: transposeNote(c.root, semitones, spelling),
    bass: c.bass && transposeNote(c.bass, semitones, spelling),
  };
}

export function noteName(n: Note, notation: Notation): string {
  const base = notation === 'italian' ? ITALIAN[n.letter] : ENGLISH[n.letter];
  return base + (n.accidental > 0 ? '#' : n.accidental < 0 ? 'b' : '');
}

/** Minor chords keep the marker they were written with; "m" by default (Lam, Am). */
export function formatChord(c: Chord, notation: Notation): string {
  const minor = c.minor ? (c.minorMark ?? 'm') : '';
  const bass = c.bass ? '/' + noteName(c.bass, notation) : '';
  return noteName(c.root, notation) + minor + c.suffix + bass;
}

/**
 * A chord's suffix in a notation: a suspended fourth is "sus4" in English (Csus4, also
 * written Csus) and plain "4" in Italian (Do4). Other suffixes are the same in both.
 */
export function suffixIn(suffix: string, notation: Notation): string {
  return notation === 'italian' ? suffix.replace(/^sus4|^sus(?!\d)/i, '4') : suffix.replace(/^\s*4/, 'sus4');
}

/** Notation a chord is written in ("La-" → italian, "Am" → english). */
export function chordNotation(text: string): Notation {
  return /^\s*(do|re|mi|fa|sol|la|si)/i.test(text) ? 'italian' : 'english';
}

export interface ChordRenderOptions {
  /** Target notation; 'original' keeps each chord's own notation. */
  notation: Notation | 'original';
  transpose: number;
  spelling?: Spelling;
}

/** A chord in the requested notation and key. With no change requested, the text is kept as is. */
export function renderChord(text: string, opts: ChordRenderOptions): string {
  if (opts.notation === 'original' && opts.transpose % 12 === 0) return text;
  const c = parseChord(text);
  if (!c) return text;
  const from = chordNotation(text);
  const notation = opts.notation === 'original' ? from : opts.notation;
  // Minor chords in Do Re Mi are written "La-", the usual sign in Italian songbooks;
  // in English "Am" ("A-" is rare). Chords already in their notation keep their sign.
  if (from === 'italian' && notation === 'english' && c.minorMark === '-') c.minorMark = 'm';
  if (from === 'english' && notation === 'italian' && c.minor) c.minorMark = '-';
  if (from !== notation) c.suffix = suffixIn(c.suffix, notation);
  return formatChord(transposeChord(c, opts.transpose, opts.spelling ?? 'auto'), notation);
}

// Chords that belong to a key, as (semitones above the tonic, minor). Minor keys
// include both the minor and the major (harmonic) fifth.
const MAJOR_CHORDS: [number, boolean][] = [[0, false], [2, true], [4, true], [5, false], [7, false], [9, true]];
const MINOR_CHORDS: [number, boolean][] = [[0, true], [3, false], [5, true], [7, true], [7, false], [8, false], [10, false]];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10, 11];

/**
 * The most likely key of a song from its chords, in their order, e.g. "G" or "Lam";
 * null without chords. Each key scores its own chords (fully) and chords on its scale
 * (partly); the tonic chord counts extra, most of all as the first and last chord,
 * which tells a major key from its relative minor. The name keeps the song's
 * notation and its spelling of that note.
 */
export function guessKey(chords: string[]): string | null {
  const parsed = chords.map((text) => ({ text, c: parseChord(text) })).filter((x): x is { text: string; c: Chord } => !!x.c);
  if (!parsed.length) return null;
  let best = { score: -Infinity, tonic: 0, minor: false };
  for (const minor of [false, true]) {
    const own = minor ? MINOR_CHORDS : MAJOR_CHORDS;
    const scale = minor ? MINOR_SCALE : MAJOR_SCALE;
    for (let tonic = 0; tonic < 12; tonic++) {
      let score = 0;
      for (const [i, { c }] of parsed.entries()) {
        const step = (c.root.pc - tonic + 12) % 12;
        if (own.some(([s, m]) => s === step && m === c.minor)) score += 1;
        else if (scale.includes(step)) score += 0.3;
        else score -= 0.5;
        if (step === 0 && c.minor === minor) score += 0.5 + (i === 0 ? 1 : 0) + (i === parsed.length - 1 ? 2 : 0);
      }
      if (score > best.score) best = { score, tonic, minor };
    }
  }
  // Name: as the song spells the tonic, else with the accidentals of that key.
  const notation = chordNotation(parsed[0].text);
  const tonicChord = parsed.find(({ c }) => c.root.pc === best.tonic && c.minor === best.minor)?.c;
  const spelled = tonicChord?.root ?? parsed.find(({ c }) => c.root.pc === best.tonic)?.c.root;
  const flat = (best.minor ? FLAT_KEYS_MINOR : FLAT_KEYS_MAJOR).has(best.tonic);
  const [letter, accidental] = (flat ? FLAT_SPELLING : SHARP_SPELLING)[best.tonic];
  const root = spelled ?? { pc: best.tonic, letter, accidental };
  return noteName(root, notation) + (best.minor ? (tonicChord?.minorMark ?? (notation === 'italian' ? '-' : 'm')) : '');
}

const FLAT_KEYS_MAJOR = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
const FLAT_KEYS_MINOR = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm Bbm Ebm

/** Pick an accidental spelling for a song in the given key, after transposition. */
export function spellingForKey(key: string | undefined, transpose: number): Spelling {
  if (!key) return 'auto';
  const c = parseChord(key);
  if (!c) return 'auto';
  const pc = (((c.root.pc + transpose) % 12) + 12) % 12;
  return (c.minor ? FLAT_KEYS_MINOR : FLAT_KEYS_MAJOR).has(pc) ? 'flat' : 'sharp';
}
