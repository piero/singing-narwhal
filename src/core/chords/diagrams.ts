// Chord diagrams, in ChordPro's {define} syntax:
//
//   {define: Am base-fret 1 frets x 0 2 2 1 0 fingers 0 0 2 3 1 0}
//
// `frets` has one value per string, from the lowest string to the highest, counted
// from `base-fret` (1 = its first fret); 0 is an open string and x (or -1, N) a muted
// one. `fingers` is optional: one finger per string, 0 for none; the same finger on
// several strings at the same fret is a barre.
//
// A song shows the diagrams it defines, after its lyrics. The chord library is a
// ChordPro file of {define} lines (CHORD_LIBRARY); choosing a diagram for a song
// copies its definition into the song, so the song stays complete on its own.

import { parseSong, type SongDoc, type SongLine } from '../song/chordpro';
import { chordNotation, parseChord, renderChord, type Notation } from './chords';
import type { FontRegistry } from '../assets/fonts';
import type { DrawItem } from '../print/display';

export interface ChordShape {
  name: string;
  /** Fret of the diagram's first row, 1 or higher. */
  baseFret: number;
  /** Per string, lowest first: fret counted from baseFret (1 = first row), 0 open, -1 muted. */
  frets: number[];
  /** Per string: finger number or letter, '' for none. */
  fingers: string[];
}

const KEYWORDS = new Set(['base-fret', 'base_fret', 'frets', 'fingers', 'keys', 'copy', 'copyall', 'display', 'format', 'diagram']);

/** A {define} value as a shape, or null when it has no frets or turns its diagram off. */
export function parseDefine(value: string): ChordShape | null {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  const name = tokens.shift();
  if (!name) return null;
  const args: Record<string, string[]> = {};
  let key = '';
  for (const tok of tokens) {
    if (KEYWORDS.has(tok.toLowerCase())) args[(key = tok.toLowerCase().replace('_', '-'))] = [];
    else if (key) args[key].push(tok);
  }
  if (args.diagram?.[0]?.toLowerCase() === 'off') return null;
  const frets = (args.frets ?? []).map((f) => (/^(x|n|-1)$/i.test(f) ? -1 : Number(f)));
  if (!frets.length || frets.some((f) => !Number.isInteger(f) || f < -1)) return null;
  const baseFret = Math.max(1, Math.floor(Number(args['base-fret']?.[0]) || 1));
  const fingers = frets.map((f, i) => {
    const v = args.fingers?.[i] ?? '';
    return f > 0 && /^([1-9]|[A-Z])$/.test(v) ? v : '';
  });
  return { name, baseFret, frets, fingers };
}

export function formatDefine(s: ChordShape): string {
  let out = `${s.name} base-fret ${s.baseFret} frets ${s.frets.map((f) => (f < 0 ? 'x' : f)).join(' ')}`;
  if (s.fingers.some(Boolean)) out += ` fingers ${s.fingers.map((f) => f || '0').join(' ')}`;
  return out;
}

/** The diagrams a song defines, in order. */
export function songShapes(doc: SongDoc): ChordShape[] {
  return doc.lines.flatMap((l) => (l.kind === 'directive' && l.name === 'define' ? (parseDefine(l.value) ?? []) : []));
}

/**
 * The song with these diagrams, in this order: replaces its {define} lines that have a
 * diagram, at the place of the first one, or else after the metadata at the top.
 */
export function setSongShapes(doc: SongDoc, shapes: ChordShape[]): SongDoc {
  const lines: SongLine[] = [];
  let at = -1;
  for (const l of doc.lines) {
    if (l.kind === 'directive' && l.name === 'define' && parseDefine(l.value)) {
      if (at < 0) at = lines.length;
    } else lines.push(l);
  }
  if (at < 0) {
    at = 0;
    while (at < lines.length && (lines[at].kind === 'directive' || lines[at].kind === 'comment')) {
      const l = lines[at];
      if (l.kind === 'directive' && /^(start_of|end_of|chorus$|comment|column_break|new_page|new_physical_page)/.test(l.name)) break;
      at++;
    }
  }
  lines.splice(at, 0, ...shapes.map((s): SongLine => ({ kind: 'directive', name: 'define', value: formatDefine(s) })));
  return { lines };
}

/** Identifies a chord whatever its notation or spelling: Am, Lam, La-, A- are the same. */
export function chordKey(name: string): string {
  const c = parseChord(name);
  if (!c) return name.trim();
  return `${c.root.pc}${c.minor ? 'm' : ''}${c.suffix.trim()}${c.bass ? '/' + c.bass.pc : ''}`;
}

/** The shape for a chord name, from a list (the library or a song's diagrams). */
export function findShape(shapes: ChordShape[], name: string): ChordShape | undefined {
  const k = chordKey(name);
  return shapes.find((s) => chordKey(s.name) === k);
}

/** A shape named in a song's notation (Am → Lam in a song written in Do Re Mi). */
export function shapeFor(shape: ChordShape, notation: Notation | null): ChordShape {
  return notation ? { ...shape, name: renderChord(shape.name, { notation, transpose: 0 }) } : shape;
}

/** The chords of a song, each once, in order of first appearance. */
export function songChords(doc: SongDoc): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of doc.lines) {
    if (l.kind !== 'lyrics') continue;
    for (const c of l.chords) {
      const k = chordKey(c.chord);
      if (!parseChord(c.chord) || seen.has(k)) continue;
      seen.add(k);
      out.push(c.chord);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The chord library

/** The workspace file holding the chord library. */
export const CHORD_LIBRARY = 'chords.cho';

export function parseLibrary(text: string): ChordShape[] {
  return songShapes(parseSong(text));
}

export function serializeLibrary(shapes: ChordShape[]): string {
  const head = [
    '# Chord library of Singing Narwhal: diagrams that songs can show after their lyrics.',
    '# frets: lowest string first, counted from base-fret; 0 open, x muted.',
    '# fingers: 0 for none; the same finger on several strings is a barre.',
    '',
  ];
  return [...head, ...shapes.map((s) => `{define: ${formatDefine(s)}}`)].join('\n') + '\n';
}

/**
 * How `incoming` chords (an imported library, or any ChordPro file's {define} lines)
 * would join `library`: chords it lacks, chords it has with another shape, and chords it
 * already has as they are. Matched whatever their notation; the first of duplicates wins.
 */
export function compareLibraries(library: ChordShape[], incoming: ChordShape[]): { added: ChordShape[]; changed: ChordShape[]; same: ChordShape[] } {
  const have = new Map<string, ChordShape>();
  for (const s of library) if (!have.has(chordKey(s.name))) have.set(chordKey(s.name), s);
  const out = { added: [] as ChordShape[], changed: [] as ChordShape[], same: [] as ChordShape[] };
  const seen = new Set<string>();
  for (const s of incoming) {
    const k = chordKey(s.name);
    if (seen.has(k)) continue;
    seen.add(k);
    const mine = have.get(k);
    if (!mine) out.added.push(s);
    else if (formatDefine({ ...mine, name: '' }) === formatDefine({ ...s, name: '' })) out.same.push(s);
    else out.changed.push(s);
  }
  return out;
}

/** Notation of most chord names in a list, null without any. */
export function shapesNotation(shapes: ChordShape[]): Notation | null {
  let it = 0;
  let en = 0;
  for (const s of shapes) {
    if (!parseChord(s.name)) continue;
    if (chordNotation(s.name) === 'italian') it++;
    else en++;
  }
  return it + en === 0 ? null : it > en ? 'italian' : 'english';
}

/**
 * `library` with the `incoming` chords: new ones added at the end, named in the
 * library's notation; with `replace`, those it has with another shape take the new shape
 * (keeping their place and name).
 */
export function mergeLibraries(library: ChordShape[], incoming: ChordShape[], replace: boolean): ChordShape[] {
  const notation = shapesNotation(library);
  const { added, changed } = compareLibraries(library, incoming.map((s) => shapeFor(s, notation)));
  const out = library.map((s) => {
    const c = replace && changed.find((x) => chordKey(x.name) === chordKey(s.name));
    return c ? { ...c, name: s.name } : s;
  });
  return [...out, ...added];
}

/** Common guitar chords, to start a library from. */
export const COMMON_GUITAR_CHORDS: string = [
  'C base-fret 1 frets x 3 2 0 1 0 fingers 0 3 2 0 1 0',
  'D base-fret 1 frets x x 0 2 3 2 fingers 0 0 0 1 3 2',
  'E base-fret 1 frets 0 2 2 1 0 0 fingers 0 2 3 1 0 0',
  'F base-fret 1 frets 1 3 3 2 1 1 fingers 1 3 4 2 1 1',
  'G base-fret 1 frets 3 2 0 0 0 3 fingers 2 1 0 0 0 3',
  'A base-fret 1 frets x 0 2 2 2 0 fingers 0 0 1 2 3 0',
  'B base-fret 1 frets x 2 4 4 4 2 fingers 0 1 2 3 4 1',
  'Bb base-fret 1 frets x 1 3 3 3 1 fingers 0 1 2 3 4 1',
  'Eb base-fret 6 frets x 1 3 3 3 1 fingers 0 1 2 3 4 1',
  'Ab base-fret 4 frets 1 3 3 2 1 1 fingers 1 3 4 2 1 1',
  'F# base-fret 2 frets 1 3 3 2 1 1 fingers 1 3 4 2 1 1',
  'Cm base-fret 3 frets x 1 3 3 2 1 fingers 0 1 3 4 2 1',
  'C#m base-fret 4 frets x 1 3 3 2 1 fingers 0 1 3 4 2 1',
  'Dm base-fret 1 frets x x 0 2 3 1 fingers 0 0 0 2 3 1',
  'Em base-fret 1 frets 0 2 2 0 0 0 fingers 0 2 3 0 0 0',
  'Fm base-fret 1 frets 1 3 3 1 1 1 fingers 1 3 4 1 1 1',
  'F#m base-fret 2 frets 1 3 3 1 1 1 fingers 1 3 4 1 1 1',
  'Gm base-fret 3 frets 1 3 3 1 1 1 fingers 1 3 4 1 1 1',
  'G#m base-fret 4 frets 1 3 3 1 1 1 fingers 1 3 4 1 1 1',
  'Am base-fret 1 frets x 0 2 2 1 0 fingers 0 0 2 3 1 0',
  'Bm base-fret 1 frets x 2 4 4 3 2 fingers 0 1 3 4 2 1',
  'C7 base-fret 1 frets x 3 2 3 1 0 fingers 0 3 2 4 1 0',
  'D7 base-fret 1 frets x x 0 2 1 2 fingers 0 0 0 2 1 3',
  'E7 base-fret 1 frets 0 2 0 1 0 0 fingers 0 2 0 1 0 0',
  'G7 base-fret 1 frets 3 2 0 0 0 1 fingers 3 2 0 0 0 1',
  'A7 base-fret 1 frets x 0 2 0 2 0 fingers 0 0 2 0 3 0',
  'B7 base-fret 1 frets x 2 1 2 0 2 fingers 0 2 1 3 0 4',
  'Dm7 base-fret 1 frets x x 0 2 1 1 fingers 0 0 0 2 1 1',
  'Em7 base-fret 1 frets 0 2 0 0 0 0 fingers 0 2 0 0 0 0',
  'Am7 base-fret 1 frets x 0 2 0 1 0 fingers 0 0 2 0 1 0',
  'Cmaj7 base-fret 1 frets x 3 2 0 0 0 fingers 0 3 2 0 0 0',
  'Fmaj7 base-fret 1 frets x x 3 2 1 0 fingers 0 0 3 2 1 0',
  'Dsus2 base-fret 1 frets x x 0 2 3 0 fingers 0 0 0 1 3 0',
  'Dsus4 base-fret 1 frets x x 0 2 3 3 fingers 0 0 0 1 3 4',
  'Asus2 base-fret 1 frets x 0 2 2 0 0 fingers 0 0 1 2 0 0',
  'Asus4 base-fret 1 frets x 0 2 2 3 0 fingers 0 0 1 2 4 0',
  'Esus4 base-fret 1 frets 0 2 2 2 0 0 fingers 0 2 3 4 0 0',
]
  .map((d) => `{define: ${d}}`)
  .join('\n');

// ---------------------------------------------------------------------------
// Drawing

/** Sizes of a diagram at scale 1, in points. */
const D = {
  string: 5.6, // between strings
  fret: 6.6, // between frets
  dot: 2.2, // radius of a finger dot
  marks: 5, // row of open/muted marks above the grid
  side: 9, // room left of the grid for the base fret number
  small: 5, // size of the base fret number and fingers
  gap: 2, // between the name and the marks
};

export interface DiagramGeometry {
  width: number;
  height: number;
  /** Rows shown: at least 4, more for a wide chord. */
  rows: number;
  /** x of each string, y of the top line of the grid and of each fret line below it. */
  stringX: number[];
  gridTop: number;
  fretY: (row: number) => number;
  /** Baseline of the name. */
  nameY: number;
  scale: number;
}

export function diagramGeometry(shape: ChordShape, scale: number, nameSize: number): DiagramGeometry {
  const s = scale;
  const rows = Math.max(4, ...shape.frets);
  const nameY = nameSize;
  const gridTop = nameSize + (D.gap + D.marks) * s;
  const stringX = shape.frets.map((_, i) => (D.side + i * D.string) * s);
  const gridW = (shape.frets.length - 1) * D.string * s;
  const fingers = shape.fingers.some(Boolean) ? (D.small + 2) * s : 0;
  return {
    width: D.side * s * 2 + gridW,
    height: gridTop + rows * D.fret * s + D.dot * s + fingers,
    rows,
    stringX,
    gridTop,
    fretY: (row) => gridTop + row * D.fret * s,
    nameY,
    scale: s,
  };
}

/**
 * A diagram's drawing, with its top-left corner at the origin: the name (`label`)
 * centred above the grid, open and muted strings above the nut, finger dots (joined in
 * a barre), the base fret beside the first row, and the fingers under the strings.
 */
export function diagramItems(
  shape: ChordShape,
  label: string,
  scale: number,
  fonts: FontRegistry,
  /** Font of the name, its size, and the font of the numbers. */
  font: { name: string; size: number; small: string },
): { items: DrawItem[]; width: number; height: number } {
  const g = diagramGeometry(shape, scale, font.size);
  const width = (f: string, size: number, text: string) => fonts.width(f, size, text);
  const s = scale;
  const items: DrawItem[] = [];
  const left = g.stringX[0];
  const right = g.stringX[g.stringX.length - 1];
  const thin = 0.45 * s;
  const nameW = width(font.name, font.size, label);
  items.push({ type: 'text', x: (left + right - nameW) / 2, y: g.nameY, text: label, font: font.name, size: font.size, role: 'chord' });
  // Grid: the nut is thick at the first fret.
  for (let r = 0; r <= g.rows; r++) {
    const w = r === 0 && shape.baseFret === 1 ? 1.8 * s : thin;
    items.push({ type: 'rule', x1: left - thin / 2, y1: g.fretY(r), x2: right + thin / 2, y2: g.fretY(r), width: w });
  }
  for (const x of g.stringX) items.push({ type: 'rule', x1: x, y1: g.fretY(0), x2: x, y2: g.fretY(g.rows), width: thin });
  const small = D.small * s;
  if (shape.baseFret > 1) {
    const text = String(shape.baseFret);
    const w = width(font.small, small, text);
    items.push({ type: 'text', x: left - w - 2.5 * s, y: (g.fretY(0) + g.fretY(1)) / 2 + small * 0.35, text, font: font.small, size: small, role: 'label' });
  }
  const markY = g.gridTop - (D.marks / 2 + 0.6) * s;
  const m = 1.5 * s;
  shape.frets.forEach((f, i) => {
    const x = g.stringX[i];
    if (f === 0) items.push({ type: 'dot', x, y: markY, r: m, fill: false, lineWidth: 0.5 * s });
    else if (f < 0) {
      items.push({ type: 'rule', x1: x - m, y1: markY - m, x2: x + m, y2: markY + m, width: 0.5 * s });
      items.push({ type: 'rule', x1: x - m, y1: markY + m, x2: x + m, y2: markY - m, width: 0.5 * s });
    }
  });
  const dotY = (f: number) => (g.fretY(f - 1) + g.fretY(f)) / 2;
  // Barres: one finger on several strings at the same fret.
  const barres = new Map<string, number[]>();
  shape.frets.forEach((f, i) => {
    if (f > 0 && shape.fingers[i]) barres.set(`${shape.fingers[i]}@${f}`, [...(barres.get(`${shape.fingers[i]}@${f}`) ?? []), i]);
  });
  for (const [k, strings] of barres) {
    if (strings.length < 2) continue;
    const f = Number(k.split('@')[1]);
    const y = dotY(f);
    items.push({ type: 'rule', x1: g.stringX[strings[0]], y1: y, x2: g.stringX[strings[strings.length - 1]], y2: y, width: D.dot * 2 * s });
  }
  shape.frets.forEach((f, i) => {
    if (f > 0) items.push({ type: 'dot', x: g.stringX[i], y: dotY(f), r: D.dot * s, fill: true, lineWidth: 0 });
  });
  if (shape.fingers.some(Boolean)) {
    const y = g.fretY(g.rows) + D.dot * s + small;
    shape.fingers.forEach((f, i) => {
      if (f) items.push({ type: 'text', x: g.stringX[i] - width(font.small, small, f) / 2, y, text: f, font: font.small, size: small, role: 'label' });
    });
  }
  return { items, width: g.width, height: g.height };
}
