// Workspace assets in the browser: fonts (registered for measurement, PDF and
// preview) and images (object URLs for the preview).

import { BUNDLED_FONTS, FontRegistry, fontIdForFile, installedFontId, isFontFile, type OfferedFont } from '../../core/assets/fonts';
import { bytesReader, extractFace, readFaces } from '../../core/assets/sfnt';
import { t } from './i18n.svelte';
import { tiny } from '../workspace/desktop';
import { fromBase64, type Workspace } from '../workspace/workspace';

const bundled = new Map<string, Uint8Array>();
const registered = new Set<string>();

function registerWebFont(id: string, data: Uint8Array) {
  if (registered.has(id) || typeof FontFace === 'undefined') return;
  registered.add(id);
  const face = new FontFace(id, data.slice().buffer);
  face.load().then((f) => document.fonts.add(f)).catch(() => registered.delete(id));
}

/** Bundled fonts plus the TTF/OTF files found in the workspace. */
export async function loadFonts(workspace: Workspace, files: string[]): Promise<{ fonts: FontRegistry; errors: string[] }> {
  if (!bundled.size) {
    await Promise.all(
      BUNDLED_FONTS.map(async (id) => {
        const res = await fetch(`${import.meta.env.BASE_URL}fonts/${id}.ttf`);
        // The desktop app loads the page from file://, where a successful read has status 0.
        const data = res.ok || res.status === 0 ? new Uint8Array(await res.arrayBuffer()) : null;
        if (!data?.length) throw new Error(`${id}: HTTP ${res.status}`);
        bundled.set(id, data);
      }),
    );
  }
  const fonts = new FontRegistry();
  const errors: string[] = [];
  for (const [id, data] of bundled) {
    fonts.add(id, data);
    registerWebFont(id, data);
  }
  for (const f of files.filter(isFontFile)) {
    try {
      const data = await workspace.readBytes(f);
      const id = fontIdForFile(f);
      fonts.add(id, data);
      registerWebFont(id, data);
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message}`);
    }
  }
  return { fonts, errors };
}

// --- Fonts installed on the computer ------------------------------------------
// Listed once per session and offered to each registry; a font is read only when a
// song or page first uses it (see FontRegistry.offer).

interface LocalFontData {
  family: string;
  style: string;
  postscriptName: string;
  blob(): Promise<Blob>;
}
type QueryLocalFonts = () => Promise<LocalFontData[]>;
const queryLocalFonts = () => (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;

/** The browser can list installed fonts (Chrome and Edge, with the user's permission). */
export const localFontsSupported = () => !tiny() && typeof queryLocalFonts() === 'function';

async function localFontsAllowed(): Promise<boolean> {
  try {
    return (await navigator.permissions.query({ name: 'local-fonts' as PermissionName })).state === 'granted';
  } catch {
    return false;
  }
}

/** Installed fonts with the same id (e.g. in two folders): the first one wins. */
function offered(list: { family: string; style: string; load: () => Promise<Uint8Array> }[]): OfferedFont[] {
  const out = new Map<string, OfferedFont>();
  for (const f of list) {
    const n = installedFontId(f.family, f.style);
    if (!n || out.has(n.id)) continue;
    const id = n.id;
    out.set(id, {
      ...n,
      load: async () => {
        const data = await f.load();
        registerWebFont(id, data);
        return data;
      },
    });
  }
  return [...out.values()];
}

/** Desktop app: the backend lists the fonts that may be embedded, and reads one face on demand. */
async function desktopFonts(): Promise<OfferedFont[]> {
  const api = tiny()!.api;
  const faces = (await api.call('systemFonts')) as { path: string; index: number; family: string; style: string }[];
  return offered(faces.map((f) => ({ ...f, load: async () => fromBase64((await api.call('readFontFace', f)) as string) })));
}

/** Chrome and Edge: the licence and outline checks happen when a font is first read. */
async function browserFonts(): Promise<OfferedFont[]> {
  const list = (await queryLocalFonts()!()).filter((f) => !f.family.startsWith('.'));
  return offered(
    list.map((f) => ({
      family: f.family,
      style: f.style,
      load: async () => {
        const bytes = new Uint8Array(await (await f.blob()).arrayBuffer());
        // The data can be a whole collection: find the face by its PostScript name.
        const faces = await readFaces(bytesReader(bytes));
        const face = faces.find((x) => x.postscriptName === f.postscriptName) ?? faces[0];
        if (!face) throw new Error(t('font.unreadable'));
        if (!face.embeddable) throw new Error(t('font.notEmbeddable'));
        if (!face.usable) throw new Error(t('font.unsupported'));
        return extractFace(bytes, face.index);
      },
    })),
  );
}

let installed: Promise<OfferedFont[]> | null = null;

/**
 * Offer the installed fonts to `fonts`: always in the desktop app; in Chrome and
 * Edge once the user has allowed it (`ask` shows the browser's permission prompt,
 * and must come from a click). Returns whether any were offered.
 */
export async function offerInstalledFonts(fonts: FontRegistry, ask = false): Promise<boolean> {
  if (!installed) {
    if (tiny()) installed = desktopFonts();
    else if (localFontsSupported() && (ask || (await localFontsAllowed()))) installed = browserFonts();
    else return false;
    installed.catch(() => (installed = null));
  }
  fonts.offer(await installed);
  return true;
}

/** Object URLs of workspace images, for the SVG preview. */
export class ImageUrls {
  urls: Record<string, string> = $state({});
  private pending = new Set<string>();

  constructor(private load: (path: string) => Promise<Uint8Array>) {}

  get(path: string): string {
    if (!this.urls[path] && !this.pending.has(path)) {
      this.pending.add(path);
      this.load(path)
        .then((b) => (this.urls[path] = URL.createObjectURL(new Blob([b as unknown as ArrayBuffer]))))
        .catch(() => {})
        .finally(() => this.pending.delete(path));
    }
    return this.urls[path] ?? '';
  }
}
