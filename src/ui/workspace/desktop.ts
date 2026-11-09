// The TinyJS desktop app: the bridge to it (window.tiny), and a folder on disk read and
// written through its backend (tiny/backend/main.ts). The folder used last and the
// recent ones are kept in TinyJS's settings store.

import { t } from '../app/i18n.svelte';
import { fromBase64, MAX_RECENT, RECENT_KEY, toBase64, type Workspace } from './workspace';

export interface MenuItem {
  id?: string;
  label?: string;
  /** Shortcut with ⌘ (Ctrl elsewhere): 'q'; an uppercase letter adds ⇧. */
  key?: string;
  separator?: boolean;
}

export interface Tiny {
  api: {
    call(method: string, params?: object): Promise<unknown>;
    /** Events pushed by TinyJS or the backend; returns the unsubscribe. */
    on(event: string, fn: (data: any) => void): () => void;
  };
  quit(): void;
  /** The menu bar; a { role: 'app' } block adds items to the macOS application menu. */
  menu?: { set(menus: { role?: string; standard?: boolean; title?: string; items: MenuItem[] }[]): Promise<unknown>; on(fn: (id: string) => void): () => void };
  win?: { setTitle(title: string): Promise<unknown>; show(): void };
  /** Persistent settings, kept by TinyJS in ~/Library/Application Support/<app id>/. */
  store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
  app: {
    paths(): Promise<{ home: string; documents: string; data: string }>;
    /** Files opened with the app from Finder or dropped on its Dock icon (packaged app only). */
    onOpenFiles(fn: (paths: string[]) => void): void;
    /**
     * Updates from the manifest at tinyjs.json "update.url" (packaged app only). install()
     * downloads the new version, checks it, swaps it in and relaunches the app.
     */
    update?: { check(): Promise<UpdateInfo & { available: boolean }>; install(): Promise<unknown> };
  };
  /** The system's light or dark setting, read by the launcher (also on Windows and Linux). */
  theme?: { get(): Promise<{ dark: boolean } | null>; on(fn: (dark: boolean) => void): () => void };
  dialog: {
    pickFolder(): Promise<string | null>;
    saveFile(o?: { types?: string[] }): Promise<string | null>;
    openFiles(o?: { types?: string[] }): Promise<string[] | null>;
    alert(message: string, o?: { detail?: string; ok?: string }): Promise<unknown>;
    confirm(message: string, o?: { detail?: string; ok?: string; cancel?: string }): Promise<boolean>;
  };
}

/** A version on offer: sent by TinyJS's own checks as the 'update-available' event, or from update.check(). */
export interface UpdateInfo {
  current: string;
  latest: string | null;
  notes: string | null;
}

export function tiny(): Tiny | undefined {
  return (window as unknown as { tiny?: Tiny }).tiny;
}

/** The message of an error from TinyJS, which rejects calls with a string rather than an Error. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Workspace folder created in ~/Documents on the desktop app's first launch. */
const DEFAULT_FOLDER = 'SingingNarwhal';

export class TinyWorkspace implements Workspace {
  kind = 'folder' as const;
  constructor(private dir: string) {}
  get name() {
    return this.dir.split('/').pop() || this.dir;
  }
  get location() {
    return this.dir;
  }
  static async pick(): Promise<TinyWorkspace | null> {
    const dir = await tiny()!.dialog.pickFolder();
    if (!dir) return null;
    await rememberDir(dir);
    return new TinyWorkspace(dir);
  }

  /**
   * The folder to start in: the one used last time, or ~/Documents/SingingNarwhal
   * (created if needed) on first launch or if the last one is gone.
   */
  static async start(): Promise<{ ws: TinyWorkspace; notice?: string }> {
    const tj = tiny()!;
    const last = (await tj.store.get('folder').catch(() => null)) as string | null;
    if (last && (await tj.api.call('isDir', { path: last }).catch(() => false))) {
      await rememberDir(last);
      return { ws: new TinyWorkspace(last) };
    }
    const dir = `${(await tj.app.paths()).documents}/${DEFAULT_FOLDER}`;
    await tj.api.call('makeDir', { path: dir });
    await rememberDir(dir);
    const notice = last ? t('ws.folderMissing', { path: last, fallback: dir }) : t('ws.defaultFolder', { path: dir });
    return { ws: new TinyWorkspace(dir), notice };
  }
  private call<T>(method: string, params: object) {
    return tiny()!.api.call(method, { dir: this.dir, ...params }).catch((e) => {
      throw new Error(errorText(e));
    }) as Promise<T>;
  }
  list() {
    return this.call<string[]>('list', {});
  }
  readText(path: string) {
    return this.call<string>('readText', { path });
  }
  async readBytes(path: string) {
    return fromBase64(await this.call<string>('readBase64', { path }));
  }
  async writeText(path: string, text: string) {
    await this.call('writeText', { path, text });
  }
  async writeBytes(path: string, data: Uint8Array) {
    await this.call('writeBase64', { path, data: toBase64(data) });
  }
  async remove(path: string) {
    await this.call('remove', { path });
  }
  async rename(from: string, to: string) {
    await this.call('rename', { from, to });
  }
}

/** Desktop app: read files anywhere on disk (opened from Finder or picked) through the backend. */
export function readAbsoluteFiles(paths: string[]): Promise<{ name: string; bytes: Uint8Array }[]> {
  const t = tiny()!;
  return Promise.all(paths.map(async (p) => ({ name: p.split('/').pop()!, bytes: fromBase64((await t.api.call('readAbsolute', { path: p })) as string) })));
}

/** Desktop app: pick files anywhere on disk and read them. */
export async function readExternalFiles(types = ['odt', 'odg', 'txt', 'cho', 'chordpro', 'yaml', 'yml', 'png', 'jpg', 'jpeg', 'ttf', 'otf', 'zip']): Promise<{ name: string; bytes: Uint8Array }[]> {
  const t = tiny()!;
  return readAbsoluteFiles((await t.dialog.openFiles({ types })) ?? []);
}

/** Start in `dir` next time, and put it first among the recent folders. */
export async function rememberDir(dir: string) {
  const tj = tiny()!;
  await tj.store.set('folder', dir);
  await tj.store.set(RECENT_KEY, [dir, ...(await recentDirs()).filter((d) => d !== dir)].slice(0, MAX_RECENT));
}

export async function recentDirs(): Promise<string[]> {
  const list = await tiny()!.store.get(RECENT_KEY).catch(() => null);
  return Array.isArray(list) ? list : [];
}

export async function forgetDir(dir: string) {
  await tiny()!.store.set(RECENT_KEY, (await recentDirs()).filter((d) => d !== dir));
}
