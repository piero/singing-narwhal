// Light or dark: sets data-theme on <html>, which app.css follows. The desktop app asks
// TinyJS, which reads the system setting itself: the Windows webview (WebView2) doesn't
// always report it through prefers-color-scheme. Browsers use prefers-color-scheme.

import { tiny } from './workspace';

function apply(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function followTheme() {
  const theme = tiny()?.theme;
  if (theme) {
    // null until the launcher has reported it at startup; the event follows then.
    theme
      .get()
      .then((t) => t && apply(t.dark))
      .catch(() => {});
    theme.on(apply);
    return;
  }
  const media = matchMedia('(prefers-color-scheme: dark)');
  apply(media.matches);
  media.addEventListener('change', (e) => apply(e.matches));
}
