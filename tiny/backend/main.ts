// TinyJS backend: file access for the workspace folder chosen by the user, and the
// fonts installed on the computer. Runs in txiki.js (https://github.com/saghul/txiki.js);
// TinyJS bundles it with esbuild because it is TypeScript (see tinyjs.json).

import { extractFace, readFaces, type ReadAt } from '../../src/core/assets/sfnt';

declare const tjs: any;

const SKIP = /^\./;

async function walk(root: string, rel: string, out: string[]): Promise<string[]> {
  const dir = rel ? `${root}/${rel}` : root;
  for await (const entry of await tjs.readDir(dir)) {
    if (SKIP.test(entry.name)) continue;
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory) await walk(root, path, out);
    else out.push(path);
  }
  return out;
}

function resolve(dir: string, path: string) {
  if (path.split('/').includes('..')) throw new Error('Invalid path');
  return `${dir}/${path}`;
}

async function ensureParent(file: string) {
  const parent = file.slice(0, file.lastIndexOf('/'));
  if (parent) await tjs.makeDir(parent, { recursive: true });
}

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const isDir = (path: string): Promise<boolean> => tjs.stat(path).then((s: any) => s.isDirectory, () => false);

// Installed fonts: macOS, Linux and Windows folders (missing ones are skipped).
const FONT_DIRS = [
  `${tjs.homeDir}/Library/Fonts`,
  '/Library/Fonts',
  '/System/Library/Fonts',
  `${tjs.homeDir}/.local/share/fonts`,
  `${tjs.homeDir}/.fonts`,
  '/usr/local/share/fonts',
  '/usr/share/fonts',
  tjs.env.LOCALAPPDATA && `${tjs.env.LOCALAPPDATA}/Microsoft/Windows/Fonts`, // fonts installed for one user
  `${tjs.env.WINDIR ?? 'C:/Windows'}/Fonts`,
].filter(Boolean);
const FONT_FILE = /\.(ttf|otf|ttc|otc)$/i;

async function fontFiles(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of FONT_DIRS) {
    const files = await walk(dir, '', []).catch(() => []);
    out.push(...files.filter((f) => FONT_FILE.test(f)).map((f) => `${dir}/${f}`));
  }
  return out;
}

/** The faces of a font file, reading only its headers and name tables. */
async function fileFaces(path: string) {
  const file = await tjs.open(path, 'r');
  try {
    const read: ReadAt = async (offset, length) => {
      const buf = new Uint8Array(length);
      return buf.subarray(0, (await file.read(buf, offset)) ?? 0);
    };
    return await readFaces(read);
  } finally {
    await file.close();
  }
}

type P = Record<string, any>;

export const api = {
  isDir: async ({ path }: P) => isDir(path),
  // Creates the default workspace folder on first launch (chosen by the page).
  makeDir: async ({ path }: P) => tjs.makeDir(path, { recursive: true }),
  list: async ({ dir }: P) => (await walk(dir, '', [])).sort(),
  // tjs.readFile always returns bytes (it has no encoding option).
  readText: async ({ dir, path }: P) => new TextDecoder().decode(await tjs.readFile(resolve(dir, path))),
  readBase64: async ({ dir, path }: P) => toBase64(await tjs.readFile(resolve(dir, path))),
  writeText: async ({ dir, path, text }: P) => {
    const file = resolve(dir, path);
    await ensureParent(file);
    await tjs.writeFile(file, text);
  },
  writeBase64: async ({ dir, path, data }: P) => {
    const file = resolve(dir, path);
    await ensureParent(file);
    await tjs.writeFile(file, fromBase64(data));
  },
  remove: async ({ dir, path }: P) => tjs.remove(resolve(dir, path)),
  rename: async ({ dir, from, to }: P) => {
    const target = resolve(dir, to);
    const exists = await tjs.stat(target).then(() => true, () => false);
    if (exists) throw new Error(`File exists: ${to}`);
    await ensureParent(target);
    await tjs.rename(resolve(dir, from), target);
  },
  // Files chosen by the user in a native open dialog.
  readAbsolute: async ({ path }: P) => toBase64(await tjs.readFile(path)),
  // Target chosen by the user in a native save dialog.
  writeAbsolute: async ({ path, data }: P) => tjs.writeFile(path, fromBase64(data)),
  // Installed fonts that may be embedded in documents (licence flags allow it, and
  // the outlines are a kind the PDF writer handles). Unreadable files are skipped.
  systemFonts: async () => {
    const out: { path: string; index: number; family: string; style: string }[] = [];
    for (const path of await fontFiles()) {
      const faces = await fileFaces(path).catch(() => []);
      for (const f of faces) if (f.embeddable && f.usable) out.push({ path, index: f.index, family: f.family, style: f.style });
    }
    return out;
  },
  // One installed face as a standalone font file (taken out of its collection).
  readFontFace: async ({ path, index }: P) => toBase64(extractFace(await tjs.readFile(path), index)),
};
