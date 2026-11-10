<p align="center"><img src="public/narwhal-logo-256.png" alt="" width="160"></p>

# Singing Narwhal

Songs with chords, laid out for printing, assembled into songbooks.

- **Write songs** with chords anchored to letters: edit the lyrics and the chords move
  with them.
- **Print a song** in one or two columns chosen automatically to save paper,
  optionally two copies per sheet, ready to cut.
- **Assemble a songbook** from songs, an index, a cover and other pages, and print it as
  a fold-and-staple booklet.
- **Import** the songs you already have in `.odt` (LibreOffice/Word) or `.txt` files, a
  whole songbook laid out in LibreOffice Draw (`.odg`), or another songbook folder with
  its songs and pages.
- Chords in **Italian (Do Re Mi) or English (C D E)** names; convert or **transpose** a
  song in one click.
- Interface in **English and Italian**.
- Free software (GPL v3).

## Choose how to use it

| | Where your files are kept | Good for |
|---|---|---|
| **Desktop app** (macOS; Windows and Linux in beta) | a folder on your computer, `~/Documents/SingingNarwhal` by default | a group's real songbook |
| **Website in Chrome or Edge** | a folder on your computer that you choose | the same, without installing anything |
| **Website in Safari or Firefox** | inside the browser, until you download a backup | trying it out, quick edits |

Download the latest desktop app
[![latest release](https://img.shields.io/github/v/release/piero/singing-narwhal?label=)](https://github.com/piero/singing-narwhal/releases/latest):

- [**macOS**](https://github.com/piero/singing-narwhal/releases/latest/download/Singing-Narwhal-macos.dmg) (Apple Silicon and Intel)
- [**Windows**](https://github.com/piero/singing-narwhal/releases/latest/download/Singing-Narwhal-windows.zip) (beta)
- **Linux** (beta): [x86_64](https://github.com/piero/singing-narwhal/releases/latest/download/Singing-Narwhal-linux-x86_64.tar.gz)
  or [ARM](https://github.com/piero/singing-narwhal/releases/latest/download/Singing-Narwhal-linux-arm64.tar.gz)

Older versions and what changed in each are on the
[releases page](https://github.com/piero/singing-narwhal/releases).

**macOS:** open the `.dmg` and drag Singing Narwhal to Applications. The app isn't signed
by Apple yet, so the first time you open it macOS says *"Singing Narwhal.app" Not Opened:
Apple could not verify…*. Click **Done** (not Move to Bin), then either:

- open System Settings → Privacy & Security, scroll down to *"Singing Narwhal.app" was
  blocked*, click **Open Anyway** and confirm with your password; or
- in Terminal, take the app out of quarantine:

  ```sh
  xattr -dr com.apple.quarantine "/Applications/Singing Narwhal.app"
  ```

After that it opens normally. Each new version you download needs this once again.

**Windows:** unzip it anywhere and run `narwhal.exe` (keep `launcher.exe` next to it). If
Windows says it protected your PC, click **More info → Run anyway**.

**Linux:** unpack it anywhere and run `narwhal` (keep `launcher` and `icon.png` next to
it). It needs WebKitGTK 4.1: `sudo apt install libwebkit2gtk-4.1-0` on Debian/Ubuntu 24.04
or newer.

The website also works on phones and tablets: the sidebar opens from ☰, and on narrow
screens **Edit | Preview** at the top switches between the editor and the printed page.
Phones and tablets keep files in the browser (see below).

The desktop app and a folder in Chrome/Edge keep your work as ordinary files: you can
back them up, sync them (iCloud, Dropbox, Drive) and share them like any other folder.
Files kept inside the browser are easier to lose (see [below](#if-you-work-in-the-browser)).

## Workflows

### Start

- **Desktop app:** open it. On first launch it creates `~/Documents/SingingNarwhal` and
  works there. To use another folder, click **Open folder…**; the app reopens it next
  time.
- **Website, Chrome or Edge:** click **Open folder…** and pick (or create) a folder for
  your songbook. Next time the site reopens it, or shows **Reopen folder** if the browser
  asks for permission again.
- **Several songbooks:** keep each in its own folder. The sidebar lists the **Recent
  folders** (up to 8) so you can switch between them with one click; **×** removes a
  folder from the list without deleting it.
- **Website, Safari or Firefox:** just start. Your files are kept in the browser; the
  sidebar says so and reminds you to make backups.

The sidebar always shows where the open workspace is, at its top: the folder's name and
path (or *This browser*). The first launch offers a short **Tutorial**; it is also at the
bottom of the sidebar. Hover the **?** icons for help on each part (for example the
editor's shortcuts, next to *Editor | ChordPro source*).

### Bring in songs you already have

1. Click **Import…** and use **Choose files…** for single songs, pages or songbooks, or
   **Choose a folder…** to import a folder with everything in it (for example another
   songbook with its `songs/`, `pages/` and `images/`). You can also drag files and
   folders onto the dialog, or paste text and click **Add pasted text**. In the desktop app you can also open `.odt`, `.odg` and `.cho`
   files from Finder (**Open With → Singing Narwhal**) or drop them on its Dock icon.
2. The files are listed under *To import*. Click a song to see its converted text (in
   ChordPro) and correct it if needed; ✕ leaves a file out. Files that would replace one
   already in the workspace are marked, and the dialog warns if an imported songbook or
   page uses files that are not there.
3. Click **Done** to copy them into the workspace, or **Cancel** to import nothing.
4. Check each imported song in the editor: chords may need a nudge where the original was
   aligned by eye, or written in a font other than Times, Arial, Courier or Liberation.

| You have | Formats | What happens |
|---|---|---|
| Songs with chords on the line above the lyrics | `.odt`, `.txt`, pasted text | converted to ChordPro songs in `songs/` |
| A songbook laid out in LibreOffice Draw, two A5 pages per landscape sheet | `.odg` | a songbook, with each song in `songs/`, the other pages (cover, notes…) in `pages/` and their pictures in `images/`; pictures next to songs are left out |
| A chord library (`*.chords.cho`, or any ChordPro file with only chord diagrams) | `.cho` | goes in `chords/` under its file name, replacing the workspace's library with the same name |
| ChordPro songs (from other apps) | `.cho`, `.chordpro`, `.chopro`, `.crd`, `.pro` | copied into `songs/` as they are |
| Pictures for covers or full pages | `.png`, `.jpg` | copied into `images/` |
| Extra fonts | `.ttf`, `.otf` | copied into `fonts/`, usable in pages |
| Single pages and songbooks | `.page.yaml`, `.songbook.yaml` | copied into `pages/` and the top folder; to bring the songs and pages a songbook uses, import its folder instead |
| A songbook folder, or any folder of the files above | a folder (**Choose a folder…**) | everything is added to the workspace in the same subfolders, replacing files with the same path; `.odt`, `.txt` and `.odg` files in it are converted |
| A backup or a zipped songbook folder | `.zip` | the same as its folder |

Imported files are **copied**: the originals are never changed. Word files (`.docx`,
`.doc`) must be saved as `.odt` first (in LibreOffice or Word); `.rtf` and `.pdf` cannot be
imported. A document holding many songs is imported as one song for now.

### Write a song

1. Click **+** next to *Songs* and give it a title.
2. Type the lyrics. Click above a letter to add a chord, or type it inline like `[Am]`.
   Drag a chord to move it to another letter.
3. Use the toolbar above the lyrics to mark a **Chorus**, **Verse** or **Bridge**, repeat
   the chorus, add a note or force a column/page break. They act on the paragraph with the
   cursor; to act on exact lines, select them first with Shift+click or Shift+↑/↓ (on a
   phone: **Select lines**, then tap the first and last line). With lines selected you can
   also put a break after them, which moves the text across an existing break, and cut,
   copy and paste them with their chords. Long lines wrap; chords follow their letters.
4. **Chords: Do Re Mi | C D E** converts the chord names (minor chords become `La-` in
   Do Re Mi, `Am` in C D E; suspended fourths `Do4` and `Csus4`); **Transpose −½ / +½** changes the key. Both edit the song
   and can be undone.
5. The **Key** field (under ⋯) shows the song's key. If the song doesn't state one, the
   key is guessed from the chords and shown in grey italics; type a key to set it. The key
   decides whether transposing writes sharps or flats (E♭ rather than D♯ in B♭).

Changes are written when you click **Save** above the editor (or press ⌘S, Ctrl+S on
Windows and Linux); until then the bar says *Unsaved changes*. Opening another file or
switching folder asks first whether to save them, and so does quitting the desktop app
with **Safe Quit** (⌘Q, Ctrl+Q on Windows and Linux). Closing it another way (the window's close button,
or the second *Quit* item in the macOS application menu, which the app can't remove) quits
at once, keeping the unsaved changes aside: the next time you start the app it asks
whether to restore them or discard them. If a save fails (for example, no space left), a
red error bar says so.

### Chord diagrams

A song can print diagrams of its chords on its last page, beside the lyrics when they
leave room on the right or after them otherwise, for players who need a reminder of the
fingering.

1. **Set up the chord library:** click **Guitar** under *Chord library* in the sidebar.
   It has the about 40 common guitar chords that come with the app: change or remove them
   as you like, and **+ Chord** adds one. Each library is a file in `chords/` (for
   example `chords/Guitar.chords.cho`), written once you change it. For another
   instrument or set of chords, **+** next to *Chord library* creates another library,
   empty (it can start from the common guitar chords too).
   **Chords: Do Re Mi | C D E** rewrites the chord names in either notation, and
   **Order: As added | By note** shows the list in the file's order or grouped by note
   (C, C#, D…; the file keeps its order). Click a group's name to collapse or expand it.
2. **Draw each chord:** click a fret on the diagram to put a finger there (click again to
   lift it), and click above the grid to switch a string between open (○) and muted (×).
   Or type the numbers:
   - **Frets** go from the lowest string, `0` open, `x` muted. Four numbers make a
     ukulele chord.
   - **First fret** moves the diagram up the neck, for chords played higher up (it is
     printed beside the diagram).
   - **Fingers** are optional (1–4, `0` for none); the same finger on several strings
     is drawn as a barre.
3. **Pick a song's diagrams:** in the song, click **▸ Diagrams** (under ⋯ on a phone;
   closed, it lists the song's diagrams on one line). Choose chords from **+ Add…**, or
   click **The song's chords** to add every chord the song uses that the library has.
   With several libraries, pick the one to use first (remembered for the next songs).
   Hover a chip to see its diagram; **×** removes it, **Remove all** removes them all. A
   dashed chip is a chord the song doesn't use (for example, after a transposition the
   library couldn't follow).

To share a library or move it to another workspace, use the ⋯ menu next to it, where you
can also rename or delete it (or rename it from its name at the top, when it is open):
- **Export library…** saves it as a ChordPro file. In the other workspace, **⤓** next to
  *Chord library* adds it as a library of its own (or **Import…** at the top, with other
  files).
- **Import chords…** adds the chords of such a file, or of any ChordPro song with
  `{define}` lines. Chords you already have with a different shape are listed, and you
  choose whether to replace them.

Each diagram is copied into the song, so the song prints the same anywhere, also when
shared or imported elsewhere. Changing the library later doesn't change the songs: remove
the diagram from a song and add it again to update it.

- **Names:** chords are matched whatever their notation, so the library's `Am` serves
  `Lam` and `La-`. The diagram carries the name as the song writes it.
- **Transposing:** each diagram is swapped for the library's diagram of the new chord.
- **Hiding:** diagrams are printed only with the chords: unticking **Show chords**, or a
  songbook without chords, leaves them out.

### Print a song

In the preview on the right, choose the page size, how to print (1 per sheet, 2 copies per
sheet, 2 pages per sheet), the columns and the font, and whether to show the chords
(untick **Show chords** for a lyrics-only sheet; the song keeps its chords), then **Export PDF**.

### Fonts

The font lists in songs and pages offer:

- the fonts that come with the app: Liberation Serif, Sans and Mono, Crimson Text,
  Courier Prime and Atkinson Hyperlegible;
- fonts you imported (`.ttf`, `.otf`, kept in `fonts/` in the workspace);
- the fonts **installed on your computer**, under *Installed on this computer*: always in
  the desktop app; in Chrome and Edge after clicking **Use fonts installed on this
  computer** in the sidebar and allowing it. Safari and Firefox don't give websites
  access to installed fonts.

Installed fonts whose licence forbids embedding them in documents are not listed (in
Chrome and Edge, they are refused when first used), nor are variable and colour fonts.
A song or page that uses an installed font shows *(not available)* next to its name on a
computer that lacks it, and is printed in Liberation Serif there. To take a font along,
import its file into the workspace.

### Make a songbook

1. Click **+** next to *Songbooks*.
2. Add songs (one by one or all at once), an index, blank pages, images, and pages such as
   a cover or a notes page (**Add page…**, started from a template and then editable).
3. Choose the page size and printing (usually A5 booklet), then **Export PDF**.
4. Print double-sided, flipping on the short edge, fold the stack in half and staple. The
   page order is already arranged for that.

Pages and songs can be shared by several songbooks: editing one changes it everywhere.

### Keep track of what is in which songbook

- In the sidebar, the number next to each song and page is how many songbooks include it
  (hover to see which). Songs and pages in no songbook are dimmed and marked ○; tick
  **Unused** to list just those.
- While a songbook is open, the songs and pages it contains are marked in the sidebar.
- Above a song or page, **In songbooks:** links to each songbook that includes it.
- To delete several songs and pages, click **Select…**, tick them (or **Select all
  shown**, which respects the search and the filter) and click **Delete…**. Before
  anything is deleted, you are told which songbooks will lose which songs and pages.

### Save, share and back up

| To | Use |
|---|---|
| print | **Export PDF** (a song or a songbook) |
| send one song, songbook or page | ⋯ menu next to it → **Save a copy as…** (`.cho`, `.songbook.yaml`, `.page.yaml`, or the image) |
| send or move one songbook with everything it uses (songs, pages, images, fonts) | **Download as .zip** in the songbook, or ⋯ menu next to it; the receiver imports it with **Import…** |
| back up everything, or move it to another computer or browser | **Download all (.zip)**, then import it with **Import…** to restore it |
| move from the browser to a folder | **Save all to folder…** (desktop app, Chrome, Edge): copies everything and keeps working there |

The ⋯ menu also has **Rename…** and **Delete…**; songbooks that use the file are updated.

### If you work in the browser

Files kept in the browser stay there when you reload the page or close the browser, and
are there at your next visit. They are **lost** if:

- you used a **private window** (deleted when it closes);
- you **clear the browser's data** for the site;
- you use **Safari** and don't open the site for **7 days**;
- the computer runs out of disk space and the browser needs room.

If the sidebar says **Protected from automatic deletion**, the browser has agreed not to
delete them when disk space runs low (the last case). Browsers grant this on their own
terms, often to sites you use regularly.

They also exist only in **that browser, on that computer, at that web address**: another
browser or device sees none of them. So **Download all (.zip)** regularly; the sidebar
shows the date of your last backup and warns when something changed since.

## More

- [Technical overview](docs/TECHNICAL.md): architecture, file formats, storage, distribution.
- [Developer guide](docs/DEVELOPMENT.md): code structure, running and testing, contributing,
  roadmap.

## Licence

Singing Narwhal is free software under the [GNU General Public License v3.0 or later](LICENSE).
Songbooks you make with it are yours and are not covered by the GPL.
