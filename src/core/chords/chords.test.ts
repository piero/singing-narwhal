import { describe, expect, it } from 'vitest';
import { getMeta, parseSong, serializeSong } from '../song/chordpro';
import { songKey, transposeSong } from '../song/transform';
import { guessKey, parseChord, renderChord, spellingForKey } from './chords';

const it_ = (notation: 'italian' | 'english', transpose = 0) => ({ notation, transpose });

describe('chords', () => {
  it('parses English and Italian names', () => {
    expect(parseChord('F#m7/C#')).toMatchObject({ root: { pc: 6 }, minor: true, suffix: '7', bass: { pc: 1 } });
    expect(parseChord('La-')).toMatchObject({ root: { pc: 9 }, minor: true, suffix: '' });
    expect(parseChord('Mi–')).toMatchObject({ root: { pc: 4 }, minor: true });
    expect(parseChord('SOL')).toMatchObject({ root: { pc: 7 }, minor: false });
    expect(parseChord('Gmaj7/D')).toMatchObject({ root: { pc: 7 }, minor: false, suffix: 'maj7', bass: { pc: 2 } });
    expect(parseChord('Sol 4')).toMatchObject({ root: { pc: 7 }, suffix: ' 4' });
  });

  it('leaves non-chords alone', () => {
    for (const s of ['N.C.', '|', '(2x)', 'Rit.', 'Intro', 'x2']) expect(parseChord(s)).toBeNull();
    expect(renderChord('N.C.', it_('english', 3))).toBe('N.C.');
  });

  it('converts notation', () => {
    expect(renderChord('Am', it_('italian'))).toBe('La-');
    expect(renderChord('F#m7', it_('italian'))).toBe('Fa#-7');
    expect(renderChord('Bbmin', it_('italian'))).toBe('Sib-');
    expect(renderChord('Amin7', it_('english', 2))).toBe('Bmin7');
    expect(parseChord('Amin7/G')).toMatchObject({ root: { pc: 9 }, minor: true, minorMark: 'min', suffix: '7', bass: { pc: 7 } });
    expect(parseChord('Amaj7')).toMatchObject({ minor: false, suffix: 'maj7' });
    expect(renderChord('La-', it_('english'))).toBe('Am');
    expect(renderChord('Lam', it_('english'))).toBe('Am');
    expect(renderChord('Mi–7', it_('italian', 2))).toBe('Fa#-7');
    expect(renderChord('Lam', it_('italian', 2))).toBe('Sim');
    expect(renderChord('Rem/Fa', it_('italian', -2))).toBe('Dom/Mib');
    expect(renderChord('Bbmaj7/F', it_('italian'))).toBe('Sibmaj7/Fa');
    expect(renderChord('Re7', it_('english'))).toBe('D7');
  });

  it('transposes', () => {
    expect(renderChord('C', it_('english', 2))).toBe('D');
    expect(renderChord('A', it_('english', -2))).toBe('G');
    expect(renderChord('Do', it_('italian', 1))).toBe('Do#');
    expect(renderChord('E', it_('english', 12))).toBe('E');
    expect(renderChord('F', { notation: 'english', transpose: 5, spelling: spellingForKey('F', 5) })).toBe('Bb');
    // C+1 is written in Db (5 flats) rather than C# (7 sharps).
    expect(renderChord('C', { notation: 'english', transpose: 1, spelling: spellingForKey('C', 1) })).toBe('Db');
    expect(renderChord('F#m', { notation: 'english', transpose: 2, spelling: spellingForKey('D', 2) })).toBe('G#m');
  });
});

describe('key guessing', () => {
  const chords = (s: string) => s.split(' ');

  it('finds major keys from their chords, first and last chord', () => {
    expect(guessKey(chords('C G Am F C'))).toBe('C');
    expect(guessKey(chords('G D Em C G D G'))).toBe('G');
    expect(guessKey(chords('F Bb C7 F'))).toBe('F');
  });

  it('tells a minor key from its relative major', () => {
    expect(guessKey(chords('Am Dm E7 Am'))).toBe('Am');
    expect(guessKey(chords('Em C G D Em'))).toBe('Em');
  });

  it('keeps the notation, minor marker and spelling of the song', () => {
    expect(guessKey(chords('Re La Si- Sol Re'))).toBe('Re');
    expect(guessKey(chords('La- Re- Mi La-'))).toBe('La-');
    expect(guessKey(chords('Eb Ab Bb7 Eb'))).toBe('Eb');
    expect(guessKey([])).toBeNull();
    expect(guessKey(['N.C.'])).toBeNull();
  });

  it('uses {key} when the song has one, the guess otherwise', () => {
    expect(songKey(parseSong('{key: D}\n[C]la [G]la'))).toEqual({ key: 'D', guessed: false });
    expect(songKey(parseSong('[Am]la [Dm]la [E]la [Am]la'))).toEqual({ key: 'Am', guessed: true });
  });

  it('spells transposed chords for the guessed key, without writing it', () => {
    // G up 6 semitones is D flat major: Db Gb Ab, where the default would write C# F# Ab.
    const song = transposeSong(parseSong('[G]la [C]la [D]la [G]la'), 6);
    expect(serializeSong(song).trim()).toBe('[Db]la [Gb]la [Ab]la [Db]la');
    expect(getMeta(song, 'key')).toBeUndefined();
  });
});
