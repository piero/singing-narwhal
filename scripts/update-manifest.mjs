// Merges the update manifests written by `tinyjs publish` on each platform into the one
// the desktop app checks (tinyjs.json "update"), with every download pointing at the
// GitHub release of the tag. Run by the release workflow (.github/workflows/release.yml):
//
//   node scripts/update-manifest.mjs v0.7.0 manifest-*.json > manifest.json
//
// macOS fills the top-level url and sha256, Windows the "win" block and Linux one block
// per CPU in "linux"; each block carries the version too (see TinyJS's release guide).
import { readFileSync } from 'node:fs';

const [tag, ...files] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY;
if (!tag || !files.length || !repo) {
  throw new Error('usage: GITHUB_REPOSITORY=owner/repo node scripts/update-manifest.mjs <tag> <manifest.json>...');
}
const version = tag.replace(/^v/, '');
const download = (url) => `https://github.com/${repo}/releases/download/${tag}/${url.split('/').pop()}`;
const entry = ({ url, sha256 }) => ({ version, url: download(url), sha256 });

const out = { version };
for (const file of files) {
  const m = JSON.parse(readFileSync(file, 'utf8'));
  if (m.version !== version) throw new Error(`${file} is for version ${m.version}, not ${version}`);
  if (m.win) out.win = { ...entry(m.win), x86_64: entry(m.win.x86_64 ?? m.win) };
  else if (m.linux) for (const [arch, e] of Object.entries(m.linux)) (out.linux ??= {})[arch] = entry(e);
  else ({ url: out.url, sha256: out.sha256 } = entry(m));
}
const missing = [!out.url && 'macOS', !out.win && 'Windows', !out.linux?.x86_64 && 'Linux x86_64', !out.linux?.arm64 && 'Linux arm64'].filter(Boolean);
if (missing.length) throw new Error(`no update for ${missing.join(', ')}`);
console.log(JSON.stringify(out, null, 2));
