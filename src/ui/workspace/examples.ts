// The example songbook in examples/, bundled into the app.

import { fromBase64 } from './workspace';

/** The example's text files, at their paths in examples/. */
const EXAMPLE = import.meta.glob<string>(['/examples/**/*.cho', '/examples/**/*.yaml'], { query: '?raw', import: 'default', eager: true });
/** Its images, as data: URLs (examples/images/ only: other images there are source material). */
const EXAMPLE_IMAGES = import.meta.glob<string>('/examples/images/*.{png,jpg,jpeg}', { query: '?inline', import: 'default', eager: true });
export const EXAMPLE_BOOK = 'canzoniere.songbook.yaml';
export function exampleFiles(): [string, Uint8Array][] {
  const path = (p: string) => p.slice('/examples/'.length);
  return [
    ...Object.entries(EXAMPLE).map(([p, text]): [string, Uint8Array] => [path(p), new TextEncoder().encode(text)]),
    ...Object.entries(EXAMPLE_IMAGES).map(([p, url]): [string, Uint8Array] => [path(p), fromBase64(url.slice(url.indexOf(',') + 1))]),
  ];
}
