import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const revision = 'fbe8ad03abc7aef2d2d95a4e573c03ab30c8d3c3';
const output = resolve(process.argv[3] || 'lsite-build');
const localSource = process.argv[2];
const source = resolve(localSource || '.');
const assetDirs = ['audio', 'images', 'lib', 'licenses', 'models', 'public-snapshots81', 'tracks'];
const topFiles = ['THIRD_PARTY_NOTICES.md', 'index.html', 'about.html', 'manifest.json', 'forced_square.json', 'forced_square.woff2',
  'help-controls.css', 'home-ui.css', 'practice-responsive.css', 'responsive-ui.css', 'public-name-policy.js',
  'polytrack_062_patch.js', 'polytrack_physics.wasm', 'site-version.json', 'snapshot-current.json'];
const moduleDirs = ['tools', 'events', 'extra-tracks'];
const isTest = /(?:^|\/)[^/]+\.(?:test|spec|browser)\./;
if (output === source || !output.startsWith(resolve('.') + (process.platform === 'win32' ? '\\' : '/'))) {
  throw new Error('The output folder must be beneath the current working directory and separate from the source.');
}

function replaceRequired(sourceText, search, replacement) {
  if (!sourceText.match(search)) throw new Error(`Missing expected source marker: ${search}`);
  return sourceText.replace(search, replacement);
}

function edit(filename, transform) {
  const target = join(output, filename);
  writeFileSync(target, transform(readFileSync(target, 'utf8')));
}

function browserModuleFilter(entry) {
  const name = entry.slice(source.length + 1).replaceAll('\\', '/');
  const suffix = extname(name);
  if (name === 'tools') return true;
  if (name.startsWith('tools/') && (name.split('/').length !== 2 || !['.mjs', '.json', '.css'].includes(suffix))) return false;
  return !isTest.test(name) && !/\/(?:node_modules|verifier|fixtures|__tests__)(?:\/|$)/.test(name) && !['.cjs', '.md', '.cs', '.yml', '.yaml', '.jsonc'].includes(suffix) && !name.endsWith('/package.json');
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Unexpected symbolic link in the game build');
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

function fingerprint(directory) {
  const digest = createHash('sha256');
  for (const name of filesIn(directory).map(file => file.slice(directory.length + 1).replaceAll('\\', '/')).sort()) {
    digest.update(name + '\0');
    digest.update(createHash('sha256').update(readFileSync(join(directory, name))).digest());
  }
  return digest.digest('hex');
}

{
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output);
  for (const dir of assetDirs) cpSync(join(source, dir), join(output, dir), { recursive: true });
  for (const name of [...topFiles, ...readdirSync(source).filter(name => /\.bundle\.js$/.test(name))]) {
    cpSync(join(source, name), join(output, name));
  }

  for (const dir of moduleDirs) {
    cpSync(join(source, dir), join(output, dir), { recursive: true, filter: browserModuleFilter });
  }

  const official = 'https://www.crazygames.com/game/polytrack';
  const notice = `Unofficial PolyTrack Ranked mod by StaticQuasar931. For the original version please visit: <a href="${official}" target="_blank" rel="noopener noreferrer">${official}</a>`;
  const attribution = 'Original game by <a href="https://www.kodub.com/" target="_blank" rel="noopener noreferrer">Kodub.com</a>. This unofficial version has no affiliation with or endorsement or sponsorship from Kodub.com, CrazyGames, Poki, or itch.io.';
  const policy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; media-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

  edit('index.html', html => {
    html = replaceRequired(html, /<meta name="robots"[^>]*>/, `<meta name="robots" content="noindex, nofollow">\n    <meta http-equiv="Content-Security-Policy" content="${policy}">\n    <meta name="referrer" content="no-referrer">`);
    html = replaceRequired(html, /<script>\s*window\.dataLayer[\s\S]*?<\/script>/, '');
    html = replaceRequired(html, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
    html = html.replace(/^\s*<(?:meta (?:property="og:|name="twitter:)[^>]+|link rel="canonical"[^>]+)>/gm, '');
    html = replaceRequired(html, /<script>\s*window\.POLYTRACK_TURN_BROKER_URL[\s\S]*?<\/script>/, `<script>\n      window.polytrackModConfiguration = { modName: 'PolyTrack Ranked', author: 'StaticQuasar931' };\n      window.POLYTRACK_DIRECT_PUBLIC_READS = false;\n      window.RTCPeerConnection = undefined;\n      window.webkitRTCPeerConnection = undefined;\n    </script>`);
    html = replaceRequired(html, /<body>/, `<body>\n    <aside aria-label="About this version" style="position:fixed;left:12px;right:12px;bottom:8px;z-index:10000;pointer-events:none;text-align:center;color:#fff;font:12px/1.5 system-ui;text-shadow:0 1px 3px #000,0 1px 5px #000"><span style="background:#161e3fe8;border-radius:6px;padding:4px 8px;display:inline-block">${notice}<br>${attribution} Local racing and archived standings.<br><a href="https://lsite-plus.onrender.com/#games" style="pointer-events:auto">Back to lsite plus</a></span></aside>`);
    return html.replaceAll('target="_blank" rel="noopener noreferrer"', 'target="_blank" rel="noopener noreferrer" style="pointer-events:auto"');
  });

  edit('about.html', html => replaceRequired(html, /<link rel="canonical"[^>]*>/, '<meta name="robots" content="noindex, nofollow">\n    <meta name="referrer" content="no-referrer">').replace('</footer>', `<p>${notice}</p><p>${attribution}</p></footer>`));
  edit('polytrack_062_patch.js', js => replaceRequired(js, /endpoint:module\.CANONICAL_SITE_VERSION_URL/, "endpoint:new URL('../site-version.json',eventsModuleUrl).href"));
  edit('tools/snapshot-update-check.mjs', js => {
    js = replaceRequired(js, /const POINTER = '[^']+';\r?\nconst CURRENT = '[^']+';/, "const CURRENT = new URL('../snapshot-current.json', import.meta.url).href;");
    return replaceRequired(js, /Object\.freeze\(\[POINTER, CURRENT\]\)/, 'Object.freeze([CURRENT])');
  });
  edit('tools/release-history.mjs', js => js.split('export async function buildReleaseHistory(')[0]);
  for (const filename of readdirSync(join(output, 'tools')).filter(name => name.endsWith('.mjs'))) {
    const candidate = join(output, 'tools', filename);
    const code = readFileSync(candidate, 'utf8');
    if (!/['"]node:|\bprocess\.argv\b|^#!\/usr\/bin\/env node/m.test(code)) continue;
    rmSync(candidate);
  }
  writeFileSync(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  const actualFingerprint = fingerprint(output);
  const reviewedFingerprint = 'f3802b1b76e5b9ea13f8736d2afcdc5725f663d0787e8a03442db2e793da41ce';
  if (!localSource && actualFingerprint !== reviewedFingerprint) throw new Error(`Game assets differ from the reviewed build of ${revision}: ${actualFingerprint}`);
  console.log(`Prepared the static browser build of ${revision} (${actualFingerprint}).`);
}
