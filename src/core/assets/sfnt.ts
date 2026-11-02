// OpenType / TrueType font files (.ttf, .otf, .ttc): the faces a file holds, read
// from its table directories and a few small tables only (so that hundreds of
// installed fonts can be indexed without loading them), and extraction of one face
// from a collection, which the PDF writer can't embed as a whole.
//
// Used by the desktop backend (tiny/backend/main.ts) as well as the app.

/** Reads `length` bytes at `offset` (fewer at the end of the file). */
export type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;

export interface FaceInfo {
  /** Position in a collection; 0 for a single font. */
  index: number;
  /** Family in the four-style model (name ID 1), e.g. "Avenir Next Medium". */
  family: string;
  /** Style within that family (name ID 2), e.g. "Bold Italic". */
  style: string;
  postscriptName: string;
  /** The licence flags (OS/2 fsType) allow embedding the font in documents. */
  embeddable: boolean;
  /**
   * Has outlines the PDF writer can embed: TrueType or CFF, not colour bitmaps, and
   * not a variable font (pdf-lib's subsets of those lose glyphs).
   */
  usable: boolean;
}

const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

export const bytesReader =
  (bytes: Uint8Array): ReadAt =>
  async (offset, length) =>
    bytes.subarray(offset, offset + length);

interface Table {
  tag: string;
  offset: number;
  length: number;
}

/** Offsets of the faces' table directories. */
async function faceOffsets(read: ReadAt): Promise<number[]> {
  const h = await read(0, 12);
  if (h.length < 12) return [];
  const t = tag(h, 0);
  if (t === 'ttcf') {
    const n = u32(h, 8);
    const o = await read(12, n * 4);
    return Array.from({ length: n }, (_, i) => u32(o, i * 4));
  }
  return t === 'OTTO' || t === 'true' || u32(h, 0) === 0x00010000 ? [0] : [];
}

async function tables(read: ReadAt, at: number): Promise<Map<string, Table>> {
  const n = u16(await read(at + 4, 2), 0);
  const d = await read(at + 12, n * 16);
  const out = new Map<string, Table>();
  for (let i = 0; i < n; i++) out.set(tag(d, i * 16), { tag: tag(d, i * 16), offset: u32(d, i * 16 + 8), length: u32(d, i * 16 + 12) });
  return out;
}

const utf16 = (b: Uint8Array) => String.fromCharCode(...Array.from({ length: b.length >> 1 }, (_, i) => u16(b, i * 2)));
const latin1 = (b: Uint8Array) => String.fromCharCode(...b);

/** Names by ID, preferring Windows English, then any Unicode, then Macintosh Roman. */
function names(b: Uint8Array): Record<number, string> {
  const count = u16(b, 2);
  const strings = u16(b, 4);
  const best: Record<number, { score: number; text: string }> = {};
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const [platform, encoding, lang, id, len, off] = [0, 2, 4, 6, 8, 10].map((k) => u16(b, r + k));
    const score =
      platform === 3 && (encoding === 1 || encoding === 10) ? (lang === 0x409 ? 4 : 3) : platform === 0 ? 2 : platform === 1 && encoding === 0 && lang === 0 ? 1 : 0;
    if (!score || (best[id]?.score ?? 0) >= score) continue;
    const raw = b.subarray(strings + off, strings + off + len);
    best[id] = { score, text: platform === 1 ? latin1(raw) : utf16(raw) };
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.text.trim()]));
}

/**
 * OS/2 fsType: "restricted licence" (bit 1 without the more permissive bits 2–3)
 * or "bitmap embedding only" (bit 9) forbid embedding the outlines.
 */
const embeddable = (fsType: number) => !((fsType & 0x2 && !(fsType & 0xc)) || fsType & 0x200);

/** The faces in a font file; empty if it isn't an OpenType/TrueType font or collection. */
export async function readFaces(read: ReadAt): Promise<FaceInfo[]> {
  const out: FaceInfo[] = [];
  for (const [index, at] of (await faceOffsets(read)).entries()) {
    const t = await tables(read, at);
    const name = t.get('name');
    if (!name) continue;
    const n = names(await read(name.offset, name.length));
    const os2 = t.get('OS/2');
    const fsType = os2 && os2.length >= 10 ? u16(await read(os2.offset + 8, 2), 0) : 0;
    const outlines = (t.has('glyf') && t.has('loca')) || t.has('CFF ');
    out.push({
      index,
      family: n[1] ?? '',
      style: n[2] || 'Regular',
      postscriptName: n[6] ?? '',
      embeddable: embeddable(fsType),
      usable: outlines && !t.has('sbix') && !t.has('CBDT') && !t.has('fvar'),
    });
  }
  return out;
}

/** One face of a collection as a standalone font; other fonts are returned as they are. */
export function extractFace(bytes: Uint8Array, index: number): Uint8Array {
  if (tag(bytes, 0) !== 'ttcf') return bytes;
  if (index >= u32(bytes, 8)) throw new Error(`No face ${index} in the collection`);
  const at = u32(bytes, 12 + index * 4);
  const n = u16(bytes, at + 4);
  const dir = at + 12;
  const pad = (len: number) => (len + 3) & ~3;
  let size = 12 + n * 16;
  for (let i = 0; i < n; i++) size += pad(u32(bytes, dir + i * 16 + 12));
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(bytes.subarray(at, at + 12), 0); // version and search fields
  let pos = 12 + n * 16;
  for (let i = 0; i < n; i++) {
    const e = dir + i * 16;
    const offset = u32(bytes, e + 8);
    const length = u32(bytes, e + 12);
    out.set(bytes.subarray(e, e + 8), 12 + i * 16); // tag and checksum
    view.setUint32(12 + i * 16 + 8, pos);
    view.setUint32(12 + i * 16 + 12, length);
    out.set(bytes.subarray(offset, offset + length), pos);
    pos += pad(length);
  }
  return out;
}
