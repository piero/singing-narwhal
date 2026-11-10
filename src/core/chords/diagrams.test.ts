import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSong, serializeSong } from '../song/chordpro';
import {
  compareLibraries,
  mergeLibraries,
  diagramItems,
  findShape,
  formatDefine,
  parseDefine,
  parseLibrary,
  isChordLibrary,
  isLibraryText,
  readLibrary,
  serializeLibrary,
  setSongShapes,
  shapeFor,
  songChords,
  songShapes,
} from './diagrams';
import { BUNDLED_FONTS, FontRegistry } from '../assets/fonts';
import { DEFAULT_STYLE, layoutSong } from '../song/layout';
import { convertNotation, transposeSong } from '../song/transform';

const fonts = new FontRegistry();
for (const id of BUNDLED_FONTS) fonts.add(id, new Uint8Array(readFileSync(join(__dirname, '../../../public/fonts', id + '.ttf'))));
/** The library bundled with the app (src/ui/chords/libraries.ts). */
const COMMON_GUITAR_CHORDS = readFileSync(join(__dirname, '../../ui/chords/guitar.chords.cho'), 'utf8');
const library = parseLibrary(COMMON_GUITAR_CHORDS);

describe('chord definitions', () => {
  it('reads ChordPro {define}', () => {
    expect(parseDefine('Am base-fret 1 frets x 0 2 2 1 0 fingers 0 0 2 3 1 0')).toEqual({
      name: 'Am',
      baseFret: 1,
      frets: [-1, 0, 2, 2, 1, 0],
      fingers: ['', '', '2', '3', '1', ''],
    });
    expect(parseDefine('Bes base_fret 3 frets N 1 3 3 3 -1')).toMatchObject({ baseFret: 3, frets: [-1, 1, 3, 3, 3, -1] });
    expect(parseDefine('G frets 3 2 0 0 0 3')).toMatchObject({ baseFret: 1 });
    expect(parseDefine('Am')).toBeNull(); // a name only: no diagram
    expect(parseDefine('Am frets x 0 2 2 1 0 diagram off')).toBeNull();
  });

  it('writes them back', () => {
    const v = 'Bm base-fret 1 frets x 2 4 4 3 2 fingers 0 1 3 4 2 1';
    expect(formatDefine(parseDefine(v)!)).toBe(v);
    expect(formatDefine(parseDefine('D frets x x 0 2 3 2')!)).toBe('D base-fret 1 frets x x 0 2 3 2');
  });

  it('finds a chord whatever its notation', () => {
    expect(findShape(library, 'Lam')?.name).toBe('Am');
    expect(findShape(library, 'La-')?.name).toBe('Am');
    expect(findShape(library, 'Sib')?.name).toBe('Bb');
    expect(findShape(library, 'A#')?.name).toBe('Bb');
    expect(findShape(library, 'Am7')?.name).toBe('Am7');
    expect(findShape(library, 'Am9')).toBeUndefined();
    expect(shapeFor(findShape(library, 'Am')!, 'italian').name).toBe('La-');
  });

  it('compares an imported library with the workspace one', () => {
    const incoming = parseLibrary(
      [
        '{define: La- base-fret 1 frets x 0 2 2 1 0 fingers 0 0 2 3 1 0}', // the same as Am
        '{define: G base-fret 1 frets 3 2 0 0 3 3}', // another G
        '{define: Cadd9 base-fret 1 frets x 3 2 0 3 3}', // new
        '{define: Cadd9 base-fret 1 frets x 3 2 0 3 0}', // a duplicate: ignored
      ].join('\n'),
    );
    const r = compareLibraries(library, incoming);
    expect(r.same.map((s) => s.name)).toEqual(['La-']);
    expect(r.changed.map((s) => s.name)).toEqual(['G']);
    expect(r.added.map((s) => s.name)).toEqual(['Cadd9']);
    expect(r.added[0].frets).toEqual([-1, 3, 2, 0, 3, 3]);
  });

  it('merges imported chords, in the library notation', () => {
    const mine = parseLibrary('{define: La- base-fret 1 frets x 0 2 2 1 0}\n{define: Sol base-fret 1 frets 3 2 0 0 0 3}');
    const incoming = parseLibrary('{define: G base-fret 1 frets 3 2 0 0 3 3}\n{define: Em base-fret 1 frets 0 2 2 0 0 0}');
    expect(mergeLibraries(mine, incoming, false).map(formatDefine)).toEqual([
      'La- base-fret 1 frets x 0 2 2 1 0',
      'Sol base-fret 1 frets 3 2 0 0 0 3',
      'Mi- base-fret 1 frets 0 2 2 0 0 0',
    ]);
    expect(mergeLibraries(mine, incoming, true)[1]).toMatchObject({ name: 'Sol', frets: [3, 2, 0, 0, 3, 3] });
  });

  it('keeps the starter library valid', () => {
    expect(library.length).toBeGreaterThan(30);
    for (const s of library) {
      expect(s.frets).toHaveLength(6);
      expect(Math.max(...s.frets)).toBeLessThanOrEqual(4);
    }
    expect(parseLibrary(serializeLibrary(library))).toEqual(library);
  });

  it('uses the fallback chords until the library has its file', async () => {
    const files: Record<string, string> = {};
    const read = async (p: string) => {
      if (!(p in files)) throw new Error(`File not found: ${p}`);
      return files[p];
    };
    const path = 'chords/Guitar.chords.cho';
    expect(await readLibrary(read, path, COMMON_GUITAR_CHORDS)).toEqual({ shapes: library, exists: false });
    files[path] = '{define: La- base-fret 1 frets x 0 2 2 1 0}';
    expect((await readLibrary(read, path, COMMON_GUITAR_CHORDS)).shapes.map((s) => s.name)).toEqual(['La-']);
    files[path] = '# Chord library\n'; // a file without chords: empty, as its user left it
    expect(await readLibrary(read, path, COMMON_GUITAR_CHORDS)).toEqual({ shapes: [], exists: true });
  });

  it('bundles the common guitar chords as a library file', () => {
    expect(library.length).toBeGreaterThan(30);
    expect(serializeLibrary(library)).toBe(COMMON_GUITAR_CHORDS);
  });

  it('reads other libraries as they are, even empty', async () => {
    const files: Record<string, string> = { 'chords/ukulele.chords.cho': '# Chord library\n' };
    const read = async (p: string) => {
      if (!(p in files)) throw new Error(`File not found: ${p}`);
      return files[p];
    };
    expect(await readLibrary(read, 'chords/ukulele.chords.cho')).toEqual({ shapes: [], exists: true });
    expect(await readLibrary(read, 'chords/missing.chords.cho')).toEqual({ shapes: [], exists: false });
    files['chords/ukulele.chords.cho'] = '{define: C base-fret 1 frets 0 0 0 3}';
    expect((await readLibrary(read, 'chords/ukulele.chords.cho')).shapes.map((s) => s.frets)).toEqual([[0, 0, 0, 3]]);
  });

  it('tells a chord library by its contents', () => {
    expect(isLibraryText(COMMON_GUITAR_CHORDS)).toBe(true);
    expect(isLibraryText('{define: C base-fret 1 frets 0 0 0 3}\n')).toBe(true);
    expect(isLibraryText('{title: Song}\n{define: C base-fret 1 frets 0 0 0 3}\n')).toBe(false);
    expect(isLibraryText('{define: C base-fret 1 frets 0 0 0 3}\n[C]Hello\n')).toBe(false);
    expect(isLibraryText('# just a comment\n')).toBe(false);
  });

  it('tells chord libraries from songs', () => {
    expect(isChordLibrary('chords.cho')).toBe(true);
    expect(isChordLibrary('chords/ukulele.chords.cho')).toBe(true);
    expect(isChordLibrary('songs/chords.cho')).toBe(false);
    expect(isChordLibrary('songs/amazing-grace.cho')).toBe(false);
  });
});

describe('diagrams in songs', () => {
  const song = '{title: T}\n{key: D}\n\n[D]Siamo [G]Aquile [Bm]randagie [D]ancora\n';

  it('lists the chords of a song once, in order', () => {
    expect(songChords(parseSong(song))).toEqual(['D', 'G', 'Bm']);
  });

  it('adds definitions after the metadata, and replaces them in place', () => {
    const shapes = ['D', 'G'].map((n) => findShape(library, n)!);
    const doc = setSongShapes(parseSong(song), shapes);
    expect(serializeSong(doc).split('\n').slice(0, 4)).toEqual([
      '{title: T}',
      '{key: D}',
      '{define: D base-fret 1 frets x x 0 2 3 2 fingers 0 0 0 1 3 2}',
      '{define: G base-fret 1 frets 3 2 0 0 0 3 fingers 2 1 0 0 0 3}',
    ]);
    const again = setSongShapes(doc, [shapes[1]]);
    expect(songShapes(again).map((s) => s.name)).toEqual(['G']);
    expect(serializeSong(again)).toContain('{key: D}\n{define: G');
  });

  it('renames definitions with the notation and swaps them when transposing', () => {
    const doc = setSongShapes(parseSong(song), [findShape(library, 'D')!, findShape(library, 'Bm')!]);
    expect(songShapes(convertNotation(doc, 'italian')).map((s) => s.name)).toEqual(['Re', 'Si-']);
    const up = transposeSong(doc, 2, library);
    expect(songShapes(up)).toEqual([findShape(library, 'E'), { ...findShape(library, 'C#m')!, name: 'C#m' }]);
    // Without a library diagram for the new chord, the old one stays.
    expect(songShapes(transposeSong(doc, 1, [])).map((s) => s.name)).toEqual(['D', 'Bm']);
  });
});

describe('drawing diagrams', () => {
  const opts = { width: 420, height: 595, columns: 1 as const, notation: 'original' as const, transpose: 0, showChords: true };

  it('draws dots, barres, open and muted strings', () => {
    const font = { name: 'LiberationSerif-Bold', size: 9.5, small: 'LiberationSerif-Regular' };
    const f = diagramItems(findShape(library, 'F')!, 'F', 1, fonts, font).items;
    expect(f.filter((i) => i.type === 'dot' && i.fill)).toHaveLength(6);
    expect(f.some((i) => i.type === 'rule' && i.width > 4)).toBe(true); // barre
    const am = diagramItems(findShape(library, 'Am')!, 'Am', 1, fonts, font).items;
    expect(am.filter((i) => i.type === 'dot' && !i.fill)).toHaveLength(2); // open strings
    expect(am.filter((i) => i.type === 'text').map((i) => i.type === 'text' && i.text)).toEqual(['Am', '2', '3', '1']);
    const cm = diagramItems(findShape(library, 'Cm')!, 'Cm', 1, fonts, font).items;
    expect(cm.some((i) => i.type === 'text' && i.text === '3')).toBe(true); // base fret
  });

  // Lyrics as wide as the page leave no room beside them.
  const wide = 'tutti quanti insieme '.repeat(8);

  it('places them after the lyrics, named as the song writes the chord', () => {
    const doc = parseSong(`{title: T}\n{define: Am base-fret 1 frets x 0 2 2 1 0}\n\n[La-]Ciao a [Do]${wide}`);
    const page = layoutSong(doc, fonts, DEFAULT_STYLE, opts).pages[0];
    const lyricsBottom = Math.max(...page.items.filter((i) => i.type === 'text' && i.role === 'lyrics').map((i) => (i.type === 'text' ? i.y : 0)));
    const name = page.items.find((i) => i.type === 'text' && i.role === 'chord' && i.text === 'La-');
    const label = page.items.filter((i) => i.type === 'text' && i.text === 'La-');
    expect(label).toHaveLength(2); // above the lyrics and over the diagram
    expect(label[1].type === 'text' && label[1].y).toBeGreaterThan(lyricsBottom);
    expect(name).toBeDefined();
    expect(page.items.some((i) => i.type === 'dot')).toBe(true);
    // Without chords, no diagrams either.
    const plain = layoutSong(doc, fonts, DEFAULT_STYLE, { ...opts, showChords: false }).pages[0];
    expect(plain.items.some((i) => i.type === 'dot')).toBe(false);
  });

  it('fills a row with as many diagrams as fit, then starts another', () => {
    const defs = library.slice(0, 20).map((s) => `{define: ${formatDefine(s)}}`).join('\n');
    const page = layoutSong(parseSong(`{title: T}\n${defs}\n\nHel[C]lo ${wide}`), fonts, DEFAULT_STYLE, opts).pages[0];
    const names = page.items.filter((i) => i.type === 'text' && i.role === 'chord' && i.y > 80);
    const rows = new Set(names.map((i) => (i.type === 'text' ? Math.round(i.y) : 0)));
    expect(names).toHaveLength(20);
    expect(rows.size).toBeGreaterThan(1);
  });

  it('puts them beside short lyrics, in the free space on the right', () => {
    const defs = ['G', 'C', 'D', 'G7', 'Cm'].map((n) => `{define: ${formatDefine(findShape(library, n)!)}}`).join('\n');
    const verse = '[G]Luce rossa, la nel [C]canyon\n[G]ecco dove, voglio [D]andare\n';
    const page = layoutSong(parseSong(`{title: T}\n${defs}\n\n${verse.repeat(4)}`), fonts, DEFAULT_STYLE, opts).pages[0];
    const lyrics = page.items.filter((i) => i.type === 'text' && i.role === 'lyrics');
    const firstLyric = Math.min(...lyrics.map((i) => (i.type === 'text' ? i.y : 0)));
    const lastLyric = Math.max(...lyrics.map((i) => (i.type === 'text' ? i.y : 0)));
    const textRight = Math.max(...lyrics.map((i) => (i.type === 'text' ? i.x + fonts.width(i.font, i.size, i.text) : 0)));
    const dots = page.items.filter((i) => i.type === 'dot');
    expect(dots.length).toBeGreaterThan(0);
    for (const d of dots) if (d.type === 'dot') expect(d.x).toBeGreaterThan(textRight);
    // From the top of the lyrics, not below them.
    expect(Math.min(...dots.map((d) => (d.type === 'dot' ? d.y : 0)))).toBeLessThan(lastLyric);
    expect(Math.min(...dots.map((d) => (d.type === 'dot' ? d.y : 0)))).toBeGreaterThan(firstLyric - 20);
  });
});
