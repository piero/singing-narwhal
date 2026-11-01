// Font registry shared by the layout engine (text measurement) and the PDF
// writer (embedding). Fonts are identified by an id, by convention the file name
// without extension (e.g. "LiberationSerif-Bold").
//
// Both the preview and the PDF use the same metrics, so what you see while
// editing is what gets printed.

import fontkit from '@pdf-lib/fontkit';

export const BUNDLED_FONTS = [
  'LiberationSerif-Regular',
  'LiberationSerif-Bold',
  'LiberationSerif-Italic',
  'LiberationSerif-BoldItalic',
  'LiberationSans-Regular',
  'LiberationSans-Bold',
  'LiberationSans-Italic',
  'LiberationSans-BoldItalic',
  'LiberationMono-Regular',
  'LiberationMono-Bold',
  'LiberationMono-Italic',
  'LiberationMono-BoldItalic',
  'CrimsonText-Regular',
  'CrimsonText-Bold',
  'CrimsonText-Italic',
  'CrimsonText-BoldItalic',
  'CourierPrime-Regular',
  'CourierPrime-Bold',
  'CourierPrime-Italic',
  'CourierPrime-BoldItalic',
  'AtkinsonHyperlegible-Regular',
  'AtkinsonHyperlegible-Bold',
  'AtkinsonHyperlegible-Italic',
  'AtkinsonHyperlegible-BoldItalic',
];

interface FontkitFont {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  layout(text: string): { advanceWidth: number };
}

/** A font that is known but loaded only when first used (e.g. installed on the computer). */
export interface OfferedFont {
  id: string;
  /** Family name to show, e.g. "Avenir Next Medium". */
  label: string;
  load: () => Promise<Uint8Array>;
}

/** What copies of a registry share (see `copy`). */
interface State {
  bytes: Map<string, Uint8Array>;
  faces: Map<string, FontkitFont>;
  widthCache: Map<string, number>;
  offered: Map<string, OfferedFont>;
  /** Ids that came from `offer`, loaded or not. */
  installed: Set<string>;
  labels: Map<string, string>;
  loading: Map<string, Promise<void>>;
  notifying: boolean;
  onchange?: () => void;
  onerror?: (id: string, e: Error) => void;
}

export class FontRegistry {
  private s: State;

  constructor(from?: FontRegistry) {
    this.s = from?.s ?? {
      bytes: new Map(),
      faces: new Map(),
      widthCache: new Map(),
      offered: new Map(),
      installed: new Set(),
      labels: new Map(),
      loading: new Map(),
      notifying: false,
    };
  }

  /** A new object for the same fonts, so that reactive UI code sees a change. */
  copy() {
    return new FontRegistry(this);
  }

  add(id: string, data: Uint8Array) {
    const s = this.s;
    s.faces.set(id, fontkit.create(data) as unknown as FontkitFont);
    s.bytes.set(id, data);
  }

  /** Fonts to load on first use; ids already known are skipped. */
  offer(fonts: OfferedFont[]) {
    for (const f of fonts) {
      if (this.known(f.id)) continue;
      this.s.offered.set(f.id, f);
      this.s.installed.add(f.id);
      this.s.labels.set(fontFamily(f.id), f.label);
    }
  }

  /** Called after offered fonts finish loading, and when one fails. */
  listen(onchange: () => void, onerror: (id: string, e: Error) => void) {
    this.s.onchange = onchange;
    this.s.onerror = onerror;
  }

  /** Loaded and ready to measure and draw. */
  has(id: string) {
    return this.s.bytes.has(id);
  }

  /** Loaded, or offered and loadable on demand. */
  known(id: string) {
    return this.has(id) || this.s.offered.has(id);
  }

  /** Loaded font ids. */
  ids() {
    return [...this.s.bytes.keys()];
  }

  /**
   * `id` if it is loaded, otherwise `fallback`. An offered font starts loading, and
   * `onchange` tells when it can be used.
   */
  resolve(id: string, fallback: string): string {
    if (this.has(id)) return id;
    if (this.s.offered.has(id)) void this.load(id);
    return fallback;
  }

  /** Load an offered font; true once it can be used. */
  async load(id: string): Promise<boolean> {
    const s = this.s;
    const f = s.offered.get(id);
    if (!this.has(id) && f && !s.loading.has(id)) {
      const p = f
        .load()
        .then((data) => {
          this.add(id, data);
          s.offered.delete(id);
        })
        .catch((e: Error) => {
          s.offered.delete(id); // don't try again
          s.onerror?.(id, e);
        })
        .finally(() => {
          s.loading.delete(id);
          this.notify();
        });
      s.loading.set(id, p);
    }
    await s.loading.get(id);
    return this.has(id);
  }

  /** Resolves when no font is loading. */
  async idle() {
    while (this.s.loading.size) await Promise.all(this.s.loading.values());
  }

  // Fonts of a family usually finish loading together: tell once.
  private notify() {
    const s = this.s;
    if (s.notifying) return;
    s.notifying = true;
    queueMicrotask(() => {
      s.notifying = false;
      s.onchange?.();
    });
  }

  /** Font families for a picker: bundled and workspace fonts first, then installed ones. */
  families(): { family: string; label: string; installed: boolean }[] {
    const s = this.s;
    const all = new Map<string, boolean>();
    for (const id of [...s.bytes.keys(), ...s.offered.keys()]) {
      const fam = fontFamily(id);
      all.set(fam, (all.get(fam) ?? true) && s.installed.has(id));
    }
    return [...all]
      .map(([family, installed]) => ({ family, label: s.labels.get(family) ?? family, installed }))
      .sort((a, b) => Number(a.installed) - Number(b.installed) || a.label.localeCompare(b.label));
  }

  data(id: string): Uint8Array {
    const b = this.s.bytes.get(id);
    if (!b) throw new Error(`Unknown font: ${id}`);
    return b;
  }

  private face(id: string): FontkitFont {
    const f = this.s.faces.get(id);
    if (!f) throw new Error(`Unknown font: ${id}`);
    return f;
  }

  /** Width of `text` in points at the given size. */
  width(id: string, size: number, text: string): number {
    const key = id + '\u0000' + text;
    let w = this.s.widthCache.get(key);
    if (w === undefined) {
      const f = this.face(id);
      w = f.layout(text).advanceWidth / f.unitsPerEm;
      this.s.widthCache.set(key, w);
    }
    return w * size;
  }

  /** Distance from baseline to the top of the tallest glyphs, in points. */
  ascent(id: string, size: number): number {
    const f = this.face(id);
    return (f.ascent / f.unitsPerEm) * size;
  }
}

const STYLE_SUFFIX = /-(Regular|Bold|Italic|BoldItalic|Oblique|BoldOblique)$/;

/** Family part of a font id: "LiberationSerif-BoldItalic" → "LiberationSerif". */
export function fontFamily(id: string): string {
  return id.replace(STYLE_SUFFIX, '');
}

/**
 * Best known id (loaded or offered) for a family and style, falling back to the
 * regular face and then to the default serif family.
 */
export function fontVariant(reg: FontRegistry, family: string, bold: boolean, italic: boolean): string {
  const style = bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
  for (const fam of [family, 'LiberationSerif']) {
    for (const id of [`${fam}-${style}`, bold ? `${fam}-Bold` : '', `${fam}-Regular`, fam]) {
      if (id && reg.known(id)) return id;
    }
  }
  return 'LiberationSerif-Regular';
}

/**
 * A font id that can be measured and drawn now: `id` if it is loaded, otherwise
 * Liberation Serif in the same style (and `id` starts loading if it can).
 */
export function loadedFont(reg: FontRegistry, id: string): string {
  if (reg.has(id)) return id;
  const fallback = fontVariant(reg, 'LiberationSerif', /Bold/.test(id), /Italic|Oblique/.test(id));
  return reg.resolve(id, fallback);
}

/** Font families available in the registry, e.g. for a font picker. */
export function fontFamilies(reg: FontRegistry) {
  return reg.families();
}

/**
 * Font id and family label for an installed face, from its family and style
 * names; null for hidden system fonts. Styles other than regular, bold and italic
 * become part of the family: ("Avenir Next", "Medium Italic") → AvenirNextMedium-Italic.
 */
export function installedFontId(family: string, style: string): { id: string; label: string } | null {
  if (!family || family.startsWith('.')) return null;
  let bold = false;
  let italic = false;
  const rest: string[] = [];
  for (const w of style.split(/\s+/).filter(Boolean)) {
    const lw = w.toLowerCase();
    if (lw === 'bold') bold = true;
    else if (lw === 'italic' || lw === 'oblique') italic = true;
    else if (!['regular', 'roman', 'normal', 'book', 'plain'].includes(lw)) rest.push(w);
  }
  const label = [family, ...rest].join(' ');
  const compact = label.replace(/[^\p{L}\p{N}]+/gu, '');
  if (!compact) return null;
  return { id: `${compact}-${bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular'}`, label };
}

export const isFontFile = (p: string) => /\.(ttf|otf)$/i.test(p);

/** Font id for a font file in the workspace: its file name without extension. */
export const fontIdForFile = (p: string) => p.split('/').pop()!.replace(/\.(ttf|otf)$/i, '');

/** Load the bundled fonts using an environment-specific byte loader. */
export async function loadBundledFonts(load: (file: string) => Promise<Uint8Array>): Promise<FontRegistry> {
  const reg = new FontRegistry();
  await Promise.all(BUNDLED_FONTS.map(async (id) => reg.add(id, await load(`${id}.ttf`))));
  return reg;
}
