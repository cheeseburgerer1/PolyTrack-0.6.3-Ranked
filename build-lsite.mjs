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
    html = replaceRequired(html, /(<div id="staticMenu"[^>]*>\s*<a[^>]*>STATIC \/ GAMES<\/a>)/, '$1\n      <a href="https://lsite-plus.onrender.com/#games">Back to lsite plus</a>\n      <button type="button" id="lsite-open-credits" aria-haspopup="dialog" aria-controls="lsite-game-credits">Game credits</button>');
    html = replaceRequired(html, /<div id="transition-layer"><\/div>/, `<div id="transition-layer"></div>
    <dialog id="lsite-game-credits" aria-labelledby="lsite-game-credits-title">
      <h2 id="lsite-game-credits-title">Game credits</h2>
      <p>${notice}</p>
      <p>${attribution}</p>
      <p><a href="https://www.kodub.com/games/polytrack" target="_blank" rel="noopener noreferrer">PolyTrack on Kodub.com</a></p>
      <button type="button" id="lsite-close-credits" autofocus>Close</button>
    </dialog>`);
    html = replaceRequired(html, /      window.addEventListener\('beforeunload'/, `      const lsiteCredits = document.getElementById('lsite-game-credits');
      document.getElementById('lsite-open-credits').addEventListener('click', () => lsiteCredits.showModal());
      document.getElementById('lsite-close-credits').addEventListener('click', () => lsiteCredits.close());

      window.addEventListener('beforeunload'`);
    return replaceRequired(html, /      @keyframes menuEnter/, `      #staticMenu { flex-wrap:wrap; gap:4px; max-width:calc(100% - 24px); pointer-events:none; }\n      #staticMenu a, #lsite-open-credits { pointer-events:auto; }
      #lsite-open-credits { padding:0 10px; border:0; background:#1e2d5be6; color:inherit; font:inherit; cursor:pointer; }
      .menu-ui > .warning-message.lsite-original-link, .menu > .warning-message.lsite-original-link {
        box-sizing:border-box; padding:0 12px; font:clamp(11px, 1.35vw, 14px)/1.45 system-ui,sans-serif;
        color:#dceaff; text-align:center;
      }
      .lsite-original-link a {
        color:inherit; font:inherit; text-decoration:underline; pointer-events:auto;
      }
      #lsite-game-credits {
        box-sizing:border-box; width:min(480px, calc(100% - 32px)); margin:auto; padding:20px;
        border:1px solid #88a9dc; border-radius:8px; background:#172448; color:#edf5ff;
        font:15px/1.55 system-ui,sans-serif; overflow-wrap:anywhere;
      }
      #lsite-game-credits::backdrop { background:#000a; }
      #lsite-game-credits h2, #lsite-game-credits p { margin:0 0 12px; }
      #lsite-game-credits a { color:#bce0ff; }
      #lsite-game-credits button { padding:6px 14px; font:inherit; cursor:pointer; }
      @keyframes menuEnter`);
  });

  edit('about.html', html => replaceRequired(html, /<link rel="canonical"[^>]*>/, '<meta name="robots" content="noindex, nofollow">\n    <meta name="referrer" content="no-referrer">').replace('</footer>', `<p>${notice}</p><p>${attribution}</p></footer>`));
  edit('polytrack_062_patch.js', js => {
    js = replaceRequired(js, /endpoint:module\.CANONICAL_SITE_VERSION_URL/, "endpoint:new URL('../site-version.json',eventsModuleUrl).href");
    return replaceRequired(js, /  function setUnofficialMessage\(\)\{[\s\S]*?\r?\n  \}(?=\r?\n\r?\n  let footerVisibilityObserver)/, `  function setUnofficialMessage(){
    const warning = document.querySelector('.menu-ui .warning-message, .menu .warning-message');
    if (!warning || warning.querySelector('[data-lsite-original-link]')) return;
    warning.classList.add('lsite-original-link');
    warning.innerHTML = '<a data-lsite-original-link href="${official}" target="_blank" rel="noopener noreferrer">Play the original version</a>';
  }`);
  });
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
  const reviewedFingerprint = 'f91db3143a612eb8b889e8d054dafc1be5c7a718fac53547e02fac7feb2833b0';
  if (!localSource && actualFingerprint !== reviewedFingerprint) throw new Error(`Game assets differ from the reviewed build of ${revision}: ${actualFingerprint}`);
  console.log(`Prepared the static browser build of ${revision} (${actualFingerprint}).`);
}
