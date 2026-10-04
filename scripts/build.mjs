// Bundles the app:
//   dist/site/          the website to upload to static hosting (index.html + icons, legal pages, offline worker)
//   dist/index.html     the same page as one standalone file
//   dist/artifact.html  the page without the document skeleton, for the claude.ai preview
// Set SITE_URL (e.g. SITE_URL=https://inkwell.example npm run build) to get absolute share-preview links.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const siteUrl = (process.env.SITE_URL || '').replace(/\/+$/, '');

const html = read('index.html');
const css = read('src/styles.css');
const js = ['src/config.js', 'src/engine.js', 'src/license.js', 'src/templates.js', 'src/app.js'].map(read).join('\n');

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const meta = html.match(/<meta name="description"[^>]*>/)[0];
const fonts = html.match(/<link rel="preconnect"[\s\S]*?display=swap">/)[0];
const siteHead = html.split('<!-- SITE:START -->')[1].split('<!-- SITE:END -->')[0]
  .replace(/public\//g, '')
  .replace('content="og.png"', `content="${siteUrl ? siteUrl + '/' : ''}og.png"`)
  + (siteUrl ? `<link rel="canonical" href="${siteUrl}/">\n<meta property="og:url" content="${siteUrl}/">\n` : '');
const body = html.split('<!-- BODY:START -->')[1].split('<!-- BODY:END -->')[0];
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const page = (head) => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${title}\n${meta}\n${head}${fonts}\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n<script>\n${safeJs}\n</script>\n</body>\n</html>\n`;

const dist = join(root, 'dist');
rmSync(join(dist, 'site'), { recursive: true, force: true });
mkdirSync(join(dist, 'site'), { recursive: true });
writeFileSync(join(dist, 'artifact.html'), `${title}\n${meta}\n${fonts}\n<style>\n${css}\n</style>\n${body}\n<script>\n${safeJs}\n</script>\n`);
writeFileSync(join(dist, 'index.html'), page(''));
writeFileSync(join(dist, 'site/index.html'), page(siteHead));
for (const f of readdirSync(join(root, 'public'))) copyFileSync(join(root, 'public', f), join(dist, 'site', f));
console.log(`Built dist/site/ (${readdirSync(join(dist, 'site')).length} files), dist/index.html, dist/artifact.html`);
