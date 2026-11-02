import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderChord } from '../chords/chords';
import { FontRegistry, BUNDLED_FONTS } from '../assets/fonts';
import { parseSong, serializeSong } from './chordpro';
import { convertNotation, songNotation, transposeSong } from './transform';
import { DEFAULT_STYLE, isInlineChordLine, layoutSong, structure, withFont } from './layout';
import { breakAround, copyLines, linesToText, removeLines, textToLines, wrapLines } from './sections';

describe('chordpro', () => {
  const src = `{title: Test}
{soc}
Hel[C]lo [G7]world
{eoc}

# comment
Intro: [C] [G] (2x)
`;

  it('anchors chords to letters', () => {
    const doc = parseSong(src);
    const l = doc.lines[2];
    expect(l).toEqual({ kind: 'lyrics', text: 'Hello world', chords: [{ pos: 3, chord: 'C' }, { pos: 6, chord: 'G7' }] });
  });

  it('round-trips, normalising directive names', () => {
    const out = serializeSong(parseSong(src));
    expect(out).toContain('{start_of_chorus}');
    expect(serializeSong(parseSong(out))).toBe(out);
    expect(out).toContain('Hel[C]lo [G7]world');
    expect(out).toContain('# comment');
  });

  it('prints only instrumental lines with inline chords', () => {
    const inline = (src: string) => {
      const l = parseSong(src).lines[0];
      return l.kind === 'lyrics' && isInlineChordLine(l.text, l.chords);
    };
    expect(inline('Intro: [C] [G] (2x)')).toBe(true);
    expect(inline('[Do] [Sol] [La-] | [Fa] x2')).toBe(true);
    expect(inline('Strumentale [Re] [La] (ripetere 2 volte)')).toBe(true);
    expect(inline('    [Re]       asdasda')).toBe(false);
    expect(inline('Hel[C]lo world')).toBe(false);
  });

  it('builds paragraphs and chorus references', () => {
    const s = structure(parseSong('{soc}\nA [C]b\n{eoc}\n\nverse\n\n{chorus}\n'));
    expect(s.blocks.map((b) => b.kind)).toEqual(['chorus', 'plain', 'chorus']);
    expect(s.blocks[2].rows[0]).toMatchObject({ text: 'A b…' });
  });
});

describe('layout', () => {
  const fonts = new FontRegistry();
  for (const id of BUNDLED_FONTS) fonts.add(id, new Uint8Array(readFileSync(join(__dirname, '../../../public/fonts', id + '.ttf'))));
  const opts = { width: 419.53, height: 595.28, columns: 'auto' as const, notation: 'italian' as const, transpose: 0, showChords: true };

  it('places chords above their letter', () => {
    const r = layoutSong(parseSong('{title: T}\nHel[C]lo'), fonts, DEFAULT_STYLE, opts);
    const items = r.pages[0].items;
    const chord = items.find((i) => i.type === 'text' && i.role === 'chord')!;
    const lo = items.find((i) => i.type === 'text' && i.role === 'lyrics' && i.text === 'lo')!;
    expect(chord.type === 'text' && chord.text).toBe('Do');
    expect(chord.type === 'text' && lo.type === 'text' && chord.x).toBeCloseTo(lo.type === 'text' ? lo.x : 0);
  });

  it('switches to two columns and shrinks rather than overflowing', () => {
    const verse = '[C]Lorem ipsum dolor [G]sit amet\n'.repeat(4);
    const long = Array.from({ length: 9 }, () => verse).join('\n');
    const r = layoutSong(parseSong(`{title: Long}\n${long}`), fonts, DEFAULT_STYLE, opts);
    expect(r.pages.length).toBe(1);
    expect(r.columns).toBe(2);
  });

  it('lays out a typical song on one page', () => {
    // Amazing Grace (John Newton, 1779): public domain.
    const verses = [
      'A[G]mazing grace, how [C]sweet the [G]sound\nThat saved a wretch like [D]me\nI [G]once was lost, but [C]now am [G]found\nWas blind, but [D]now I [G]see',
      "'Twas [G]grace that taught my [C]heart to [G]fear\nAnd grace my fears re[D]lieved\nHow [G]precious did that [C]grace ap[G]pear\nThe hour I [D]first be[G]lieved",
      'Through [G]many dangers, [C]toils and [G]snares\nI have already [D]come\n\'Tis [G]grace hath brought me [C]safe thus [G]far\nAnd grace will [D]lead me [G]home',
      'The [G]Lord has promised [C]good to [G]me\nHis word my hope se[D]cures\nHe [G]will my shield and [C]portion [G]be\nAs long as [D]life en[G]dures',
      'When [G]we\'ve been there ten [C]thousand [G]years\nBright shining as the [D]sun\nWe\'ve [G]no less days to [C]sing God\'s [G]praise\nThan when we\'d [D]first be[G]gun',
    ];
    const doc = parseSong(`{title: Amazing Grace}\n{artist: John Newton}\n\n${verses.join('\n\n')}\n`);
    expect(layoutSong(doc, fonts, DEFAULT_STYLE, opts).pages.length).toBe(1);
  });

  it('changes font family and size, keeping bold and italic', () => {
    const s = withFont(DEFAULT_STYLE, fonts, 'LiberationSans', 13.2);
    expect(s.lyrics).toEqual({ font: 'LiberationSans-Regular', size: 13.2 });
    expect(s.chords.font).toBe('LiberationSans-Bold');
    expect(s.subtitle.font).toBe('LiberationSans-Italic');
    expect(s.title.size).toBeCloseTo(DEFAULT_STYLE.title.size * 1.2);
    // Unknown families fall back to the default serif.
    expect(withFont(DEFAULT_STYLE, fonts, 'Missing', 11).lyrics.font).toBe('LiberationSerif-Regular');
  });

  it('leaves the chords out when they are hidden', () => {
    const r = layoutSong(parseSong('{title: T}\nHel[C]lo'), fonts, DEFAULT_STYLE, { ...opts, showChords: false });
    expect(r.pages[0].items.some((i) => i.type === 'text' && i.role === 'chord')).toBe(false);
  });
});

describe('song transforms', () => {
  const src = '{title: T}\n{key: D}\n[D]Siamo [Bm]aquile [N.C.]ran[F#7]dagie\n';

  it('transposes chords and key in the song itself', () => {
    const out = serializeSong(transposeSong(parseSong(src), 1));
    expect(out).toContain('{key: Eb}');
    expect(out).toContain('[Eb]Siamo [Cm]aquile [N.C.]ran[G7]dagie');
  });

  it('converts notation, keeping unparsed chords', () => {
    const out = serializeSong(convertNotation(parseSong(src), 'italian'));
    expect(out).toContain('{key: Re}');
    expect(out).toContain('[Re]Siamo [Si-]aquile [N.C.]ran[Fa#7]dagie');
    expect(songNotation(parseSong(out))).toBe('italian');
  });

  it('prints chords as written by default', () => {
    expect(renderChord('LA-', { notation: 'original', transpose: 0 })).toBe('LA-');
    expect(renderChord('La-', { notation: 'original', transpose: 2 })).toBe('Si-');
  });
});

describe('line selection edits', () => {
  const song = (t: string) => parseSong(t).lines;
  const text = (lines: ReturnType<typeof song>) => linesToText(lines).trimEnd();
  const base = 'A [Do]uno\nB due\nC tre\n\nD quattro';

  it('wraps exactly the selected lines in a section', () => {
    expect(text(wrapLines(song(base), 1, 2, 'chorus').lines)).toBe('A [Do]uno\n{start_of_chorus}\nB due\nC tre\n{end_of_chorus}\n\nD quattro');
  });

  it('splits a section around the selection, keeping its label on the first part', () => {
    const lines = song('{start_of_verse: Strofa}\nA\nB\nC\n{end_of_verse}');
    expect(text(wrapLines(lines, 2, 2, 'chorus').lines)).toBe(
      '{start_of_verse: Strofa}\nA\n{end_of_verse}\n{start_of_chorus}\nB\n{end_of_chorus}\n{start_of_verse}\nC\n{end_of_verse}',
    );
  });

  it('changes or removes a whole section', () => {
    const lines = song('{start_of_verse}\nA\nB\n{end_of_verse}');
    expect(text(wrapLines(lines, 1, 2, 'bridge').lines)).toBe('{start_of_bridge}\nA\nB\n{end_of_bridge}');
    expect(text(wrapLines(lines, 1, 2, 'verse').lines)).toBe('A\nB');
  });

  it('absorbs and shrinks sections the selection overlaps', () => {
    const lines = song('A\n{start_of_verse}\nB\nC\n{end_of_verse}\nD');
    // A..B: the verse loses B and keeps C
    expect(text(wrapLines(lines, 0, 2, 'chorus').lines)).toBe('{start_of_chorus}\nA\nB\n{end_of_chorus}\n{start_of_verse}\nC\n{end_of_verse}\nD');
    // the whole verse and D
    expect(text(wrapLines(lines, 1, 5, 'chorus').lines)).toBe('A\n{start_of_chorus}\nB\nC\nD\n{end_of_chorus}');
  });

  it('puts a break before or after the selection, moving an adjacent one', () => {
    const lines = song('A\n{column_break}\nB\nC');
    expect(text(breakAround(lines, 2, 3, 'new_page', 'before'))).toBe('A\n{column_break}\n{new_page}\nB\nC');
    // B..C above the column break: the break moves after them
    expect(text(breakAround(lines, 2, 2, 'column_break', 'after'))).toBe('A\nB\n{column_break}\nC');
    // a break before a section's first line goes before the section
    expect(text(breakAround(song('A\n{start_of_chorus}\nB\n{end_of_chorus}'), 2, 2, 'column_break', 'before'))).toBe('A\n{column_break}\n{start_of_chorus}\nB\n{end_of_chorus}');
  });

  it('removes lines without leaving half a section', () => {
    const lines = song('{start_of_chorus}\nA\nB\n{end_of_chorus}\nC');
    expect(text(removeLines(lines, 0, 1).lines)).toBe('B\nC');
    expect(text(removeLines(lines, 2, 2).lines)).toBe('{start_of_chorus}\nA\n{end_of_chorus}\nC');
    expect(removeLines(lines, 2, 2).at).toBe(2);
  });

  it('copies lines without half-open sections', () => {
    const lines = song('A\n{start_of_chorus}\nB\nC\n{end_of_chorus}\nD');
    expect(text(copyLines(lines, 0, 2))).toBe('A\n{start_of_chorus}\nB\n{end_of_chorus}');
    expect(text(copyLines(lines, 3, 5))).toBe('{start_of_chorus}\nC\n{end_of_chorus}\nD');
  });

  it('copies lines as ChordPro and pastes them back', () => {
    const lines = song(base);
    const copied = linesToText(lines.slice(0, 2));
    expect(copied).toBe('A [Do]uno\nB due\n');
    expect(textToLines(copied)).toEqual(lines.slice(0, 2));
  });
});
