import { readFileSync } from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// The product name and version live only in tinyjs.json ("title", "version"), the same file TinyJS
// reads for the desktop app, so a rename is a one-line change and the UI matches the About panel.
const tinyjs = JSON.parse(readFileSync(new URL('./tinyjs.json', import.meta.url), 'utf8'))
const appName: string = tinyjs.title
const appVersion: string = tinyjs.version

export default defineConfig({
  plugins: [
    svelte(),
    { name: 'app-name', transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', appName) },
  ],
  define: { __APP_NAME__: JSON.stringify(appName), __APP_VERSION__: JSON.stringify(appVersion) },
  // Relative asset paths, so the build also works when loaded from disk by TinyJS.
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
})
