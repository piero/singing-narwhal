import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLED_FONTS, FontRegistry, fontVariant, installedFontId, loadedFont } from './fonts';
import { bytesReader, extractFace, readFaces } from './sfnt';

const file = (id: string) => new Uint8Array(readFileSync(join(__dirname, '../../public/fonts', id + '.ttf')));

/** A .ttc collection of the given fonts, each keeping its own copy of every table. */
function collection(fonts: Uint8Array[]): Uint8Array {
  const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
  const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o);
  let size = 12 + fonts.length * 4;
  const dirAt: number[] = [];
  for (const f of fonts) {
    dirAt.push(size);
    size += 12 + u16(f, 4) * 16;
  }
  const out = new Uint8Array(size + fonts.reduce((n, f) => n + f.length, 0));
  const view = new DataView(out.buffer);
  out.set([0x74, 0x74, 0x63, 0x66, 0, 1, 0, 0]); // "ttcf" version 1.0
  view.setUint32(8, fonts.length);
  let data = size;
  fonts.forEach((f, i) => {
    view.setUint32(12 + i * 4, dirAt[i]);
    const n = u16(f, 4);
    out.set(f.subarray(0, 12 + n * 16), dirAt[i]);
    // Tables keep their place relative to the font's start: shift the offsets.
    for (let k = 0; k < n; k++) view.setUint32(dirAt[i] + 12 + k * 16 + 8, data + u32(f, 12 + k * 16 + 8));
    out.set(f, data);
    data += f.length;
  });
  return out;
}

describe('font files', () => {
  it('reads the names and flags of a font', async () => {
    const [face] = await readFaces(bytesReader(file('CrimsonText-BoldItalic')));
    expect(face).toMatchObject({ index: 0, family: 'Crimson Text', style: 'Bold Italic', embeddable: true, usable: true });
  });

  it('lists the faces of a collection and extracts one as a usable font', async () => {
    const ttc = collection([file('LiberationSans-Regular'), file('CourierPrime-Italic')]);
    const faces = await readFaces(bytesReader(ttc));
    expect(faces.map((f) => [f.family, f.style])).toEqual([
      ['Liberation Sans', 'Regular'],
      ['Courier Prime', 'Italic'],
    ]);
    const reg = new FontRegistry();
    reg.add('a', extractFace(ttc, 1));
    reg.add('b', file('CourierPrime-Italic'));
    expect(reg.width('a', 10, 'Perché più città')).toBeCloseTo(reg.width('b', 10, 'Perché più città'));
    const [single] = await readFaces(bytesReader(extractFace(ttc, 1)));
    expect(single.postscriptName).toBe('CourierPrime-Italic');
  });

  it('refuses fonts whose licence forbids embedding', async () => {
    const f = file('LiberationSans-Regular').slice();
    const os2 = findTable(f, 'OS/2');
    new DataView(f.buffer).setUint16(os2 + 8, 0x0002); // restricted licence
    expect((await readFaces(bytesReader(f)))[0].embeddable).toBe(false);
  });

  it('names installed fonts in the registry style', () => {
    expect(installedFontId('Georgia', 'Bold Italic')).toEqual({ id: 'Georgia-BoldItalic', label: 'Georgia' });
    expect(installedFontId('Avenir Next', 'Medium Italic')).toEqual({ id: 'AvenirNextMedium-Italic', label: 'Avenir Next Medium' });
    expect(installedFontId('Times New Roman', 'Regular')?.id).toBe('TimesNewRoman-Regular');
    expect(installedFontId('.SF NS', 'Regular')).toBeNull();
  });
});

function findTable(f: Uint8Array, tag: string): number {
  const v = new DataView(f.buffer);
  for (let i = 0; i < v.getUint16(4); i++) {
    const e = 12 + i * 16;
    if (String.fromCharCode(...f.subarray(e, e + 4)) === tag) return v.getUint32(e + 8);
  }
  throw new Error(`no ${tag}`);
}

describe('installed fonts in the registry', () => {
  function registry() {
    const reg = new FontRegistry();
    for (const id of BUNDLED_FONTS) reg.add(id, file(id));
    let loads = 0;
    reg.offer([
      { id: 'Crimson-Regular', label: 'Crimson', load: async () => (loads++, file('CrimsonText-Regular')) },
      { id: 'Crimson-Bold', label: 'Crimson', load: async () => (loads++, file('CrimsonText-Bold')) },
      { id: 'Broken-Regular', label: 'Broken', load: async () => Promise.reject(new Error('nope')) },
      { id: 'LiberationSans-Regular', label: 'Not this one', load: async () => new Uint8Array() },
    ]);
    return { reg, loads: () => loads };
  }

  it('lists installed families after the bundled ones, without loading them', () => {
    const { reg, loads } = registry();
    const fams = reg.families();
    expect(fams.at(-1)).toEqual({ family: 'Crimson', label: 'Crimson', installed: true });
    expect(fams.find((f) => f.family === 'LiberationSans')).toMatchObject({ label: 'LiberationSans', installed: false });
    expect(loads()).toBe(0);
  });

  it('chooses an installed font, draws a fallback until it is loaded, then uses it', async () => {
    const { reg, loads } = registry();
    let changes = 0;
    reg.listen(() => changes++, () => {});
    const id = fontVariant(reg, 'Crimson', true, false);
    expect(id).toBe('Crimson-Bold');
    expect(loadedFont(reg, id)).toBe('LiberationSerif-Bold');
    await reg.idle();
    await Promise.resolve();
    expect(loadedFont(reg, id)).toBe('Crimson-Bold');
    expect(reg.copy().has('Crimson-Bold')).toBe(true);
    expect(loads()).toBe(1);
    expect(changes).toBe(1);
  });

  it('reports a font that fails to load and stops offering it', async () => {
    const { reg } = registry();
    const errors: string[] = [];
    reg.listen(() => {}, (id, e) => errors.push(`${id}: ${e.message}`));
    expect(await reg.load('Broken-Regular')).toBe(false);
    expect(errors).toEqual(['Broken-Regular: nope']);
    expect(reg.known('Broken-Regular')).toBe(false);
  });
});
