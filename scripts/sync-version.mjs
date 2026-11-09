// Copies the version from package.json into tinyjs.json, where TinyJS reads it for the
// desktop app (About panel, .dmg name). Run by `npm version` (see "Releases" in
// docs/DEVELOPMENT.md), between bumping package.json and committing and tagging.
//
// It also sets the app's update channel: a pre-release version (0.7.0-beta.1) checks
// beta-manifest.json for updates, any other version manifest.json.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = version.includes('-') ? 'beta-manifest.json' : 'manifest.json';
const file = new URL('../tinyjs.json', import.meta.url);
const text = readFileSync(file, 'utf8');
const next = text
  .replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`)
  .replace(/("url"\s*:\s*"[^"]*\/)(?:beta-)?manifest\.json(")/, `$1${manifest}$2`);
if (!next.includes(`"version": "${version}"`)) throw new Error('tinyjs.json has no "version" field');
if (!next.includes(`/${manifest}"`)) throw new Error('tinyjs.json has no "update" url');
writeFileSync(file, next);
console.log(`tinyjs.json: version ${version}, updates from ${manifest}`);
