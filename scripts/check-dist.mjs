// Runs after every build. Fails if a page links to, or shows, a file that
// was not built (a broken photo or link), or shows a photo as raw Markdown.
// Also reports the site's size, since GitHub Pages stops at 1 GB.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const problems = [];
let bytes = 0;

// Names must match exactly, as on GitHub's servers: the Mac would otherwise
// accept a link whose upper/lower case differs from the real page.
const listings = new Map();
function existsExactly(relative) {
  let dir = dist;
  for (const part of relative.split('/').filter(Boolean)) {
    if (!listings.has(dir)) {
      const isDir = fs.existsSync(dir) && fs.statSync(dir).isDirectory();
      listings.set(dir, isDir ? fs.readdirSync(dir) : []);
    }
    if (!listings.get(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  // A folder counts as a page only if it has an index.html.
  return fs.statSync(dir).isDirectory() ? existsExactly(`${relative}/index.html`.replace(/\/+/g, '/')) : true;
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      bytes += fs.statSync(full).size;
      if (entry.name.endsWith('.html')) checkPage(full);
    }
  }
}

function checkPage(file) {
  const page = path.relative(dist, file);
  // Code shown on a page is text, not links or photos.
  const html = fs.readFileSync(file, 'utf8').replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/g, '');
  const unescape = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const refs = [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => unescape(m[1]));
  for (const srcset of html.matchAll(/\ssrcset="([^"]*)"/g)) {
    refs.push(...unescape(srcset[1]).split(',').map((part) => part.trim().split(/\s+/)[0]));
  }
  for (const ref of refs) {
    if (ref === '' || /^(#|\/\/|[a-z][a-z0-9+.-]*:)/i.test(ref)) continue; // anchors and other sites
    const url = new URL(ref, `https://site/${page.replace(/index\.html$/, '')}`);
    let relative;
    try {
      relative = decodeURIComponent(url.pathname);
    } catch {
      problems.push(`${page}: ${ref} is not a valid address`);
      continue;
    }
    if (!existsExactly(relative)) problems.push(`${page}: links to ${ref}, which does not exist`);
  }
  if (html.replace(/<[^>]*>/g, '').includes('![')) {
    problems.push(`${page}: shows "![" as text, so a photo was not recognised (write it like ![description](./01.jpg))`);
  }
}

walk(dist);

const mb = bytes / 1e6;
console.log(`check-dist: the built site is ${mb.toFixed(1)} MB (GitHub Pages limit: 1000 MB).`);
if (mb > 600) console.warn(`check-dist: WARNING: the site is over 600 MB. Tell the owner.`);

if (problems.length > 0) {
  console.error(`check-dist: ${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
