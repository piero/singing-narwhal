// The open file's unsaved changes. Nothing is written until the user saves: the open
// editor attaches itself here with how to save its file, and reports whether the file
// differs from what was last read or saved. The app shows it, saves on request (Save,
// ⌘S) and asks before closing a file with unsaved changes.
//
// The desktop app can't always stop a quit (the window's close button), so it also keeps
// the unsaved text aside, in Unsaved.json in its data folder, and offers it again at the
// next launch.

import { tiny } from './desktop';

/** Desktop: unsaved changes left by the last session. */
export interface Draft {
  /** Workspace folder and path of the file in it. */
  dir: string;
  path: string;
  text: string;
  time: number;
}

const DRAFT = 'Unsaved.json';
let dataDir: Promise<string> | null = null;
const draftCall = async (method: string, params: object = {}) =>
  tiny()!.api.call(method, { dir: await (dataDir ??= tiny()!.app.paths().then((p) => p.data)), path: DRAFT, ...params });

class OpenFile {
  /** The open file differs from what was last read or saved. */
  dirty = $state(false);
  #save: (() => Promise<void>) | null = null;
  #dir = '';
  #path = '';
  #pending: Promise<void> | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** Draft writes and removals, one after the other, so that a removal is never overtaken. */
  #drafts: Promise<unknown> = Promise.resolve();
  /** Changes recovered at launch, waiting for their file's editor. */
  #recovered: Draft | null = null;
  /** A draft may be on disk (most files are opened and closed without one). */
  #drafted = false;

  /**
   * An editor opened `path` in the workspace at `dir` (known on the desktop only), and
   * saves it with `save`. Returns the function to call when it closes.
   */
  attach(dir: string | undefined, path: string, save: () => Promise<void>): () => void {
    this.#save = save;
    this.#dir = dir ?? '';
    this.#path = path;
    this.dirty = false;
    return () => {
      if (this.#save !== save) return;
      // Closed with unsaved changes: the user chose not to save them.
      if (this.dirty) void this.discard();
      this.#save = null;
    };
  }

  /** The editor's file changed: `text` is its unsaved content, or null if it matches the file. */
  changed(text: string | null) {
    this.dirty = text !== null;
    if (!tiny() || !this.#dir) return;
    clearTimeout(this.#timer);
    if (text === null) {
      this.#clearDraft();
      return;
    }
    const draft: Draft = { dir: this.#dir, path: this.#path, text, time: Date.now() };
    this.#drafted = true;
    this.#timer = setTimeout(() => this.#queue(() => draftCall('writeText', { text: JSON.stringify(draft) })), 500);
  }

  /** Save the open file, if it has unsaved changes. Throws if the save fails. */
  async save() {
    if (!this.#save || !this.dirty) return;
    this.#pending = this.#save();
    try {
      await this.#pending;
    } finally {
      this.#pending = null;
    }
    // The editor reports the file as saved once it has updated; the draft goes now, in
    // case the app quits first.
    await this.#clearDraft();
  }

  /** Forget the unsaved changes (the editor is about to close). */
  async discard() {
    this.dirty = false;
    this.#recovered = null;
    await this.#clearDraft();
  }

  /** Wait for a save in progress. */
  async settle() {
    await this.#pending?.catch(() => {});
  }

  /** Desktop, at launch: the changes left unsaved in the workspace at `dir`, if any. */
  async recover(dir: string): Promise<Draft | null> {
    if (!tiny()) return null;
    const text = (await draftCall('readText').catch(() => null)) as string | null;
    this.#drafted = !!text;
    let draft: Draft | null = null;
    try {
      draft = text ? (JSON.parse(text) as Draft) : null;
    } catch {
      /* unreadable: nothing to recover */
    }
    if (draft?.dir !== dir || typeof draft.text !== 'string') {
      if (text) await this.#clearDraft();
      return null;
    }
    return (this.#recovered = draft);
  }

  /** The recovered text of `path`, once, for its editor to open instead of the file's. */
  take(path: string): string | null {
    const d = this.#recovered;
    if (d?.path !== path) return null;
    this.#recovered = null;
    return d.text;
  }

  #queue(op: () => Promise<unknown>) {
    return (this.#drafts = this.#drafts.then(op).catch(() => {}));
  }

  #clearDraft() {
    clearTimeout(this.#timer);
    if (!this.#drafted) return Promise.resolve();
    this.#drafted = false;
    return this.#queue(() => draftCall('remove'));
  }
}

export const openFile = new OpenFile();
