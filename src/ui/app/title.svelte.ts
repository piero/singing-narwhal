// The open file's title, shown and edited in the app's top bar. An editor whose file holds
// a title (a song's {title}, a songbook's title) provides it here, and edits to it are
// unsaved changes like any other; for other files the bar shows the file name and renames
// the file (App.svelte).

export interface TitleSource {
  get: () => string;
  set: (value: string) => void;
  placeholder: string;
}

class OpenTitle {
  // Raw: compared by identity when its editor closes.
  source = $state.raw<TitleSource | null>(null);

  /** An editor provides its file's title; returns the function to call when it closes. */
  provide(source: TitleSource): () => void {
    this.source = source;
    return () => {
      if (this.source === source) this.source = null;
    };
  }
}

export const openTitle = new OpenTitle();
