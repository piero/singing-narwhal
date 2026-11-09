# Developer guide

How to run, test and change Singing Narwhal. For how the pieces fit together, read the
[technical overview](TECHNICAL.md) first.

## Requirements

- Node.js 20.19+ or 22.12+ (required by Vite 8) and npm.
- For the desktop app: macOS and the [TinyJS](https://tinyjs.app/) CLI, at the version the
  release workflow pins (`TINYJS_VERSION` in `.github/workflows/release.yml`, now v0.72.0).

## Run it

```sh
npm install
npm run dev          # web app on http://127.0.0.1:5173, with hot reload
```

The web app starts with an empty workspace in browser storage. To work on test material,
use **Open folder…** (Chrome, Edge) on a folder of songs, or **Import…** them.
Keep your own local test songs in an `examples/` directory if you like; nothing in the code or the tests depends on it (`examples/` is ignored by Git).

| Command | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` | static site in `dist/` |
| `npm run preview` | serves `dist/` to check a build |
| `npm test` | unit tests (Vitest) |
| `npm run check` | type check: Svelte components and app code (`svelte-check`), CLI and config (`tsc`) |
| `npm run cli -- …` | command-line tool, see below |

### Command line

```sh
npm run cli -- songs/amazing-grace.cho -o song.pdf
npm run cli -- canzoniere.songbook.yaml -o book.pdf
npm run cli -- import ~/Documents/Canzoniere/*.odt -o songs/
```

Options: `--page A4|A5|A6|Letter`, `--imposition single|copies|2up|booklet`,
`--notation original|italian|english`, and `--columns 1|2|auto` (single songs only).
`-o` defaults to the input name with `.pdf`.

### Desktop app

```sh
tinyjs dev           # runs the app against the Vite dev server (npm run dev)
tinyjs build --dmg   # builds the app and a .dmg into dist/
```

Configuration is in `tinyjs.json`; the backend is `tiny/backend/main.ts`, which TinyJS
bundles with esbuild (it imports `src/core/assets/sfnt.ts`). The backend runs in txiki.js, not Node: check its APIs against the txiki.js runtime that ships with TinyJS
(`~/.tinyjs/bin/tjs run script.js`), not against Node's. For example, `tjs.readFile`
always returns bytes.

The macOS **About** panel shows the app name and icon, the version from `tinyjs.json` and
the text in `assets/Credits.html` (only in a built app, not in `tinyjs dev`).

### Releases

Versions follow [semantic versioning](https://semver.org) and each release is a Git tag
`vX.Y.Z`. On `main`, with everything committed:

```sh
npm run release -- patch    # 0.1.0 → 0.1.1: fixes only
npm run release -- minor    # 0.1.0 → 0.2.0: new features
npm run release -- major    # 0.1.0 → 1.0.0: breaking changes (e.g. file formats)
npm run release -- 0.3.0    # or an exact version
git push --follow-tags      # publish the commit and the tag
```

Pushing the tag starts the **Release** workflow (`.github/workflows/release.yml`) on GitHub
Actions. It checks that the tag matches `package.json`, runs the type check and tests,
builds the desktop app on GitHub's macOS, Windows and Linux machines and publishes a GitHub
release with:

- `Singing-Narwhal-macos.dmg`: one app for Apple Silicon and Intel Macs
  (`tinyjs build --universal --dmg`);
- `Singing-Narwhal-windows.zip`: the portable Windows app (`narwhal.exe` and
  `launcher.exe`, from `tinyjs build`);
- `Singing-Narwhal-linux-x86_64.tar.gz` and `Singing-Narwhal-linux-arm64.tar.gz`: the
  portable Linux app (`narwhal`, `launcher` and `icon.png`, from `tinyjs build` on
  Ubuntu 24.04). It runs in the system WebKitGTK 4.1, which users install themselves.

The names carry no version (the release title does), so the download links in the README,
`releases/latest/download/<name>`, always fetch the newest release.

Both are unsigned, so macOS asks users to allow the app in System Settings → Privacy &
Security, and Windows shows a SmartScreen warning; the release notes explain both. Signing
needs an Apple Developer ID (and notarization) and a Windows code-signing certificate,
stored as repository secrets. The workflow pins the TinyJS version (`TINYJS_VERSION`);
update it there when upgrading TinyJS locally. It downloads TinyJS, and the Intel txiki.js
runtime for the universal Mac build, with `gh release download` rather than the TinyJS
installers: GitHub's `releases/download/` links can fail with 504 errors for hours, while the
API keeps serving the same files. When `tinyjs update` can't reach GitHub for the same
reason, install by hand: `gh release download <version> -R tarwin/tinyjsapp -p
tinyjs-macos-arm64.tar.gz`, then unpack it over `~/.tinyjs` (`tar -xzf <file> -C ~/.tinyjs
--strip-components 1`). To try the builds without releasing, run
the workflow by hand (Actions → Release → Run workflow) and download them from the run's
artifacts. Windows support in TinyJS is in beta, and the Windows app is tested only by hand.

`npm run release` is `npm version`: it refuses to run with uncommitted changes, sets the
version in `package.json` and `package-lock.json`, runs `scripts/sync-version.mjs` to copy
it into `tinyjs.json` (where the desktop app reads it), then commits "Release X.Y.Z" and
tags it `vX.Y.Z`. Don't edit the version by hand. To undo a release that hasn't been
pushed: `git tag -d vX.Y.Z && git reset --hard HEAD~1`.

### Betas

A beta is a release with a pre-release version, made from any branch, so it can be tried
(updates included) without touching `main`:

```sh
npm run release -- 0.7.0-beta.1   # or: npm run release -- prerelease --preid beta
git push --follow-tags            # pushes the branch and the tag
```

The workflow publishes it as a GitHub pre-release: `releases/latest/` and the README links
skip it, so only people who download it from the releases page get it. Versions are
ordered by [semantic versioning](https://semver.org): `0.7.0-beta.1` < `0.7.0-beta.2` <
`0.7.0`.

### Updates

The desktop app updates itself from a manifest named in `tinyjs.json` (`"update"`). Each
platform's build runs `tinyjs publish`, which makes the archive the app downloads
(`narwhal-X.Y.Z.zip` for macOS, `-win.zip`, `-linux-<arch>.tar.gz`) and a manifest for that
platform; the archives are attached to the release, and `scripts/update-manifest.mjs`
merges the manifests into one that points at them. The workflow then commits it to the
`updates` branch, which holds only the manifests and has no history in common with `main`
(the first release creates it). The app reads them from `raw.githubusercontent.com`:
`releases/download/` links, the other choice, often fail with 504 errors for a while, and
the manifest is the one file every update starts from.

- `manifest.json`, checked by release versions: replaced by each release.
- `beta-manifest.json`, checked by betas: replaced by each beta *and* each release, so
  beta users are offered the release too. Once they install it they check `manifest.json`
  again, and stay on releases until they install another beta by hand.

The channel is fixed when the app is built: `scripts/sync-version.mjs` points
`tinyjs.json` at `beta-manifest.json` for a pre-release version and at `manifest.json`
otherwise. Version 0.6.4 and earlier don’t check for updates: their users install the
first version that does by hand.

To try an update on your Mac without publishing anything, serve the manifest yourself
(the updater accepts `http://` only for `127.0.0.1` and `localhost`). Don't commit these
changes to `tinyjs.json`:

1. In `tinyjs.json`, set `"update"` `"url"` to `http://127.0.0.1:8000/manifest.json`.
2. `tinyjs build`, then copy `dist/Singing Narwhal.app` to `/Applications` (the next build
   replaces `dist/`).
3. Raise `"version"` in `tinyjs.json` (e.g. `0.7.1`), then `tinyjs publish` and
   `cd dist/publish && python3 -m http.server 8000`.
4. Open the copy in `/Applications`: after a few seconds it offers the new version (or use
   Check for Updates… in the app menu). Installing replaces it and relaunches it; the About
   panel shows the new version.
5. `git checkout tinyjs.json`.

## Code structure

```
src/
  main.ts                  mounts App.svelte
  globals.d.ts             type of __APP_NAME__ (the product name, from tinyjs.json)
  App.svelte               sidebar, workspace startup and switching, file menu, error bar
  app.css                  global styles and colour tokens (light/dark)
  core/                    pure TypeScript: no DOM, no Node; used by the app and the CLI
    chords/
      chords.ts            chord parsing (English/Italian), transposition, spelling, key guessing
      diagrams.ts          chord diagrams: {define} reader/writer, chord library, drawing
    song/
      chordpro.ts          ChordPro reader/writer, one entry per source line (lossless)
      transform.ts         song-wide edits: transpose, convert notation
      sections.ts          edits on selected lines: sections, breaks, copy/cut/paste
      layout.ts            song layout: line breaking, chord spacing, columns, auto-fit
    songbook/
      songbook.ts          songbook format (.songbook.yaml) and assembly
      pages.ts             non-song pages (.page.yaml): format, layout, starter templates
    print/
      display.ts           display list: the positioned text, lines, shapes and images of a page
      impose.ts            page sizes; placing pages on sheets (copies, 2-up, booklet)
      pdf.ts               display list → PDF (pdf-lib)
    assets/
      fonts.ts             font registry, measurement (fontkit), bundled font list, installed fonts
      sfnt.ts              font files: faces, names and licence flags; extracting a face from a .ttc
      images.ts            PNG/JPEG dimensions
    import/
      index.ts             entry points: importFile, importText; plain-text reader
      odt.ts               .odt reader: styles, spacing, character positions
      odg.ts               .odg songbooks: sheets split into pages, songs and other pages
      xml.ts               minimal XML parser for .odt content
      sheet.ts             chords-over-lyrics → ChordPro converter
    */*.test.ts            tests, next to the module they cover
  ui/                      Svelte UI and browser-side services, by screen
    app/
      i18n.svelte.ts       English and Italian strings
      settings.svelte.ts   preferences remembered per browser
      Tour.svelte          welcome tutorial (first launch, and the Tutorial button)
      fonts.svelte.ts      fonts (bundled, workspace, installed) and image URLs
      theme.ts             light or dark, from the system setting
    song/
      SongView.svelte      song editor screen: metadata, chord tools, preview, export
      VisualEditor.svelte  chords-over-lyrics editor (wrapping lines), section toolbar, line selection
    songbook/
      BookView.svelte      songbook editor
      PageView.svelte      page (.page.yaml) editor
    chords/
      ChordLibraryView.svelte chord library (chords.cho, *.chords.cho) editor
      libraries.ts         the workspace's chord libraries, and the one songs use
      ChordDiagram.svelte  a chord diagram, editable by clicking its frets
    import/
      ImportDialog.svelte  import of files and pasted text
    components/            pieces shared by several screens
      Help.svelte          "?" that shows a help text on hover
      Preview.svelte       SVG rendering of sheets
      Splitter.svelte      draggable boundary between editor and preview
      FontSelect.svelte    font family picker
      DragHandle.svelte, sortable.ts   reordering lists by dragging
    workspace/
      workspace.ts         Workspace interface, file kinds, NoWorkspace, copying between workspaces
      browser.ts           BrowserWorkspace: files in IndexedDB, backup reminder
      folder.ts            BrowserFolderWorkspace: a folder through the File System Access API
      desktop.ts           TinyWorkspace and the bridge to the desktop app (window.tiny)
      recent.ts            recent folders, folder picker
      files.ts             file dialogs, "Save as…", zip import and export
      examples.ts          the bundled example songbook
      fileops.ts           rename/delete that keep songbooks consistent
      saves.svelte.ts      the open file's unsaved changes, desktop recovery copy
      idb.ts               IndexedDB helpers
cli/narwhal.ts              command line: PDF export and import
tiny/backend/main.ts       TinyJS backend: file access on disk, installed fonts
public/fonts/              bundled fonts and their licences (also read by the CLI)
public/narwhal-logo-256.png logo for the web page (favicon, sidebar, welcome screen)
assets/narwhal-logo.png     logo master; the desktop app's icon (tinyjs.json "icon")
assets/Credits.html        text of the macOS About panel
scripts/sync-version.mjs   copies the release version into tinyjs.json (npm run release)
scripts/update-manifest.mjs merges the platforms' update manifests (release workflow)
docs/                      technical overview and this guide
```

## Testing

- **Unit tests** (`npm test`) cover `src/core`: chord parsing and transposition, the
  ChordPro round trip, song structure, layout decisions, imposition order, song
  transforms, page templates, and text/`.odt` import. Add a test with every change to
  `src/core`, especially to the layout and the importer, where small changes have
  far-reaching effects.
- **Type check** (`npm run check`) must report 0 errors and 0 warnings.
- **In the browser:** there are no automated UI tests yet. Check UI changes by hand in
  Chrome and, for storage or dialog changes, in Safari and Firefox too. A clean start
  needs the site's data cleared (DevTools → Application → Storage → Clear site data).
- **Desktop app:** to test backend changes, bundle it as TinyJS does
  (`npx esbuild tiny/backend/main.ts --bundle --format=esm --platform=neutral --outfile=<dir>/main.js`)
  and import that file from a script run with TinyJS's `tjs`. For the whole app, build it
  and open it.

Before opening a pull request, run:

```sh
npm test && npm run check && npm run build
```

## Conventions

- **Keep `src/core` pure.** No DOM, browser or Node APIs there, so it keeps working in
  the browser, the desktop app and the CLI. File access goes through the `FileLoader` /
  `Workspace` interfaces.
- **Keep file formats human-readable** and stable. Songs are standard ChordPro; new song
  features should use ChordPro directives rather than a private syntax. Songbook and page
  YAML only writes options that differ from the defaults.
- **Content edits change the file; layout options don't.** Transposing and converting
  chord names rewrite the song. The preview and songbooks only decide how it is printed.
- **Every user-facing string goes in `ui/app/i18n.svelte.ts`**, in both English and Italian. The
  type check fails if the Italian dictionary misses a key, or if code uses a key that
  doesn't exist.
- **Don't hard-code the product name.** It lives only in `tinyjs.json` (`"title"`): Vite
  injects it as `__APP_NAME__` and into `index.html` (`%APP_NAME%`), and the CLI reads it
  from there. Internal identifiers use the generic `narwhal` (database `narwhal-db`,
  storage keys `narwhal:…`, app id `org.narwhal.app`) and must not change with a rename:
  changing them makes users lose their browser data or settings.
- **Import `core/pdf` dynamically in the UI** (`await import('../core/pdf')`): pdf-lib
  is only needed when exporting, so it stays out of the initial download.
- **Never report a failed save as saved.** Writes must throw on failure, so that
  `openFile.save()` rejects and the app shows the error and keeps the file unsaved.
- **The logo** has one master, `assets/narwhal-logo.png`. After changing it, regenerate
  the web copy: `sips -Z 256 assets/narwhal-logo.png --out public/narwhal-logo-256.png`.
- Match the style of the surrounding code: 2-space indentation, single quotes, short
  comments that explain why rather than what. There is no formatter configured yet.

## Contributing

Contributions are welcome, from code to translations.

1. Open an issue to discuss bigger changes before writing code.
2. Fork, create a branch, make the change with tests, and check it as described above.
3. Open a pull request explaining what changes for users and how you tested it.

By contributing you agree that your contribution is licensed under the GPL-3.0-or-later,
like the rest of the project.

- **Song lyrics:** do not commit copyrighted lyrics. Songs in tests or docs must be in the public
  domain or under a licence that allows redistribution.
- **Translations:** a new interface language means a new dictionary in
  `src/ui/app/i18n.svelte.ts` and an entry in `LANGS`.
- **Fonts:** bundled fonts must allow redistribution (e.g. SIL OFL); add their licence
  next to them in `public/fonts/`.
- **Build output:** `dist/` and `.build/` (TinyJS's working folder) are not committed.
  `tinyjs build` moves the web build into `dist/frontend/`, so run `npm run build` again
  before publishing `dist/` as the website.

## Roadmap

### Done

**Songs**
- [x] ChordPro files with chords anchored to letters; Italian (Do Re Mi) and English
      (C D E) chord names; converting and transposing rewrite the song (undoable), with
      conventional spelling.
- [x] Hybrid editor: lyrics as text, chords as chips above their letters. Click to add,
      type `[Am]` inline, drag or use ←/→ to re-anchor; undo/redo; raw ChordPro view;
      explicit Save, with a warning before losing unsaved changes.
- [x] Song structure: choruses (indented, optional label), chorus repeats, instrumental
      lines, notes, forced column/page breaks, all added from a section toolbar and shown
      as markers in the editor.
- [x] Long lines wrap in the editor, chords following their letters; whole-line selection
      to make sections, put breaks before/after (moving an adjacent one), and cut, copy and
      paste lines with their chords.

**Layout and printing**
- [x] Automatic layout: one or two columns and text scale (down to 75%) chosen to use the
      fewest pages with the fewest wrapped lines; colliding chords spaced out.
- [x] Live preview drawn from the same layout as the PDF; click the preview to jump to a
      line.
- [x] PDF export with embedded fonts; A4, A5, A6, Letter, Half Letter.
- [x] Chord diagrams after the lyrics, in ChordPro `{define}` lines picked from a chord
      library (`chords.cho`, or others in `chords/`) that starts with common guitar chords; edited by clicking
      the diagram; renamed with the notation and swapped when transposing.
- [x] Printing: 1 page per sheet, 2 copies per sheet, 2 pages per sheet, saddle-stitch
      booklets.

**Songbooks and pages**
- [x] Songbooks: songs, index with page numbers, blank pages, full-page images; per-song
      columns; page numbers on outer corners; optionally all chords in one notation.
- [x] 2-page songs start on a left page; booklet padding goes before a back cover.
- [x] Editable pages (covers, quotes, notes, ruled pages) from built-in templates: text,
      images, rounded boxes, ruled lines, flexible spacing, placeholders.
- [x] Custom fonts from the workspace's `fonts/` folder.

**Import**
- [x] `.odt`, `.txt` and pasted text with chords above the lyrics, measured with the
      document's fonts; titles, artists, choruses, labels, repeats and instrumental lines
      detected.
- [x] Songbooks laid out in LibreOffice Draw (`.odg`): sheets split into pages (booklet or
      reading order), embedded songs converted, covers and other pages rebuilt as pages.
- [x] One import dialog for single files (songs, pages, songbooks, images, fonts), folders
      and `.zip` files, which keep their subfolders; replaced and missing files flagged.
- [x] Command-line import and PDF rendering.

**App**
- [x] Workspaces: a folder on disk (desktop app, Chrome/Edge) or browser storage
      (IndexedDB); folder remembered between sessions; recent folders to switch
      between; backup reminder; restore from `.zip`; failed saves reported.
- [x] Desktop app starts in `~/Documents/SingingNarwhal` or the last folder used.
- [x] Which songbooks include each song and page (and the reverse) shown in the sidebar
      and the editors; songs and pages in no songbook marked and filterable.
- [x] Rename and delete files, one or many at once, keeping songbooks consistent (the
      confirmation lists what each songbook will lose); save a copy of any file;
      download the workspace, or one songbook with the files it uses, as a `.zip`.
- [x] Layout for phones and tablets: sidebar as a drawer, one pane at a time (Edit |
      Preview) when the editor area is narrower than 900px.
- [x] English and Italian interface; GPL-3.0-or-later.

### Next

- [ ] Test the desktop app end to end; code signing; universal (Intel + Apple Silicon)
      builds; updates; Windows/Linux.
- [ ] Automated UI tests (e.g. Playwright) in Chromium, WebKit and Firefox.
- [ ] Offline support for the website (service worker).
- [ ] Chord diagrams for a whole songbook (a page of the chords it uses).
- [ ] Images inside songs (`{image: …}`), placed in free space at the end of a column.
- [ ] Style editor for songs (fonts and sizes of lyrics, chords, titles).
- [ ] Booklet options: cover from a PDF, sections with their own index.
- [ ] Import: split documents containing several songs; `.docx` directly; `.odg` songbooks from the command line.
- [ ] Transpose `add` notes inside suffixes (e.g. `F#(addB)`).
