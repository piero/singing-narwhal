import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLED_FONTS, FontRegistry } from '../assets/fonts';
import { layoutPage, starterTemplate } from './pages';
import { resolveBookPath, songbookFiles } from './songbook';

const fonts = new FontRegistry();
for (const id of BUNDLED_FONTS) fonts.add(id, new Uint8Array(readFileSync(join(__dirname, '../../../public/fonts', id + '.ttf'))));

describe('songbook files', () => {
  it('lists the files a songbook uses, and the ones missing', async () => {
    const ws: Record<string, string> = {
      'book.songbook.yaml': 'title: B\ncontents:\n  - page: pages/cover.page.yaml\n  - song: songs/a.cho\n  - song: songs/gone.cho\n  - image: images/full.jpg\n  - blank\n',
      'pages/cover.page.yaml': 'elements:\n  - text: Hi\n    font: Fancy-Regular\n  - image: images/logo.png\n',
      'songs/a.cho': '{title: A}',
      'songs/other.cho': '{title: Other}',
      'images/logo.png': '',
      'images/full.jpg': '',
      'images/unused.png': '',
      'fonts/Fancy-Regular.ttf': '',
      'fonts/Unused-Regular.ttf': '',
    };
    const r = await songbookFiles('book.songbook.yaml', Object.keys(ws), async (p) => ws[p]);
    expect(r.files.sort()).toEqual(['book.songbook.yaml', 'fonts/Fancy-Regular.ttf', 'images/full.jpg', 'images/logo.png', 'pages/cover.page.yaml', 'songs/a.cho']);
    expect(r.missing).toEqual(['songs/gone.cho']);
  });

  it('resolves paths relative to the songbook', () => {
    expect(resolveBookPath('books/x.songbook.yaml', '../songs/a.cho')).toBe('songs/a.cho');
    expect(resolveBookPath('books/x.songbook.yaml', 'local.cho')).toBe('books/local.cho');
  });
});

describe('page templates', () => {
  it('fills the free space and replaces placeholders', () => {
    const page = layoutPage(starterTemplate('cover', 'it'), {
      fonts,
      width: 420,
      height: 595,
      defaultMargin: 28,
      defaultFont: 'LiberationSerif-Regular',
      vars: { title: 'Canzoniere' },
      imageSizes: {},
    });
    const title = page.items.find((i) => i.type === 'text' && i.text === 'Canzoniere');
    const box = page.items.find((i) => i.type === 'rect');
    expect(title).toBeTruthy();
    expect(box && box.type === 'rect' && box.y + box.height).toBeCloseTo(595 - 28);
  });
});
