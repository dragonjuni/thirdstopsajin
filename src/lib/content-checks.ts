// Checks that run while Astro reads the posts. Each one stops the build
// with a plain message naming the file, so mistakes never reach the site.
import fs from 'node:fs';
import path from 'node:path';

// Invisible or unusual spaces that would make two names look the same.
const ODD_CHARACTERS = /[\u0000-\u001F\u007F-\u00A0\u00AD\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]/;

// Shows a value with any invisible characters spelled out.
export function show(value: unknown) {
  return JSON.stringify(value).replace(new RegExp(ODD_CHARACTERS, 'g'), (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

// Reads one of the gear lists in src/data/.
export function loadList(name: string): string[] {
  const file = `src/data/${name}.json`;
  let list: unknown;
  try {
    list = JSON.parse(fs.readFileSync(path.join(process.cwd(), file), 'utf8'));
  } catch (error) {
    throw new Error(`${file} could not be read: ${(error as Error).message}`);
  }
  if (!Array.isArray(list)) {
    throw new Error(`${file} must be a list in square brackets, like ["First name", "Second name"].`);
  }
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string' || item === '' || item.trim() !== item || ODD_CHARACTERS.test(item)) {
      throw new Error(`${file}: ${show(item)} is not a clean name. Use text in quotes, with no spaces at the ends.`);
    }
    if (seen.has(item)) throw new Error(`${file}: "${item}" is listed twice.`);
    seen.add(item);
  }
  // Korean and accented names can be stored in two ways; use one.
  return list.map((item: string) => item.normalize('NFC'));
}

// A note's gear mixes cameras and lenses, so a name may only be in one of them.
export function checkNoOverlap(lists: Record<string, string[]>) {
  const owner = new Map<string, string>();
  for (const [name, list] of Object.entries(lists)) {
    for (const item of list) {
      const other = owner.get(item);
      if (other) throw new Error(`"${item}" is in both src/data/${other}.json and src/data/${name}.json. Keep it in one.`);
      owner.set(item, name);
    }
  }
}

// src/content may only hold photos/ and notes/, each post folder only en.md,
// ko.md and photos. Anything else would be skipped silently, so it fails here.
export function checkContentFolder() {
  const content = path.join(process.cwd(), 'src/content');
  if (!fs.existsSync(content)) return;
  const problems: string[] = [];
  const list = (dir: string) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.name !== '.DS_Store');
  for (const collection of list(content)) {
    const collectionPath = `src/content/${collection.name}`;
    if (!collection.isDirectory() || !['photos', 'notes'].includes(collection.name)) {
      problems.push(`${collectionPath}: only the folders photos and notes belong in src/content.`);
      continue;
    }
    for (const post of list(path.join(content, collection.name))) {
      const postPath = `${collectionPath}/${post.name}`;
      if (!post.isDirectory()) {
        problems.push(`${postPath}: put each post in its own folder.`);
        continue;
      }
      const files = list(path.join(content, collection.name, post.name));
      for (const file of files) {
        const allowed =
          !file.isDirectory() &&
          !file.name.startsWith('.') &&
          (/^(en|ko)\.md$/.test(file.name) || /\.(jpe?g|png|webp|avif|gif)$/i.test(file.name));
        if (!allowed) {
          problems.push(`${postPath}/${file.name}: a post folder may only hold en.md, ko.md and photos (.jpg, .png, .webp, .avif, .gif).`);
        }
      }
      if (!files.some((file) => /^(en|ko)\.md$/.test(file.name))) {
        problems.push(`${postPath}: the folder has no en.md or ko.md.`);
      }
    }
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));
}

// YAML ends an unquoted value at " #" (a comment), silently cutting off the
// rest of the text. This flags any line where that would happen.
function checkHashes(frontmatter: string, where: string) {
  let blockIndent = -1; // inside a | or > block, where # is plain text
  for (const line of frontmatter.split(/\r?\n/)) {
    const indent = line.length - line.trimStart().length;
    if (blockIndent >= 0) {
      if (line.trim() === '' || indent > blockIndent) continue;
      blockIndent = -1;
    }
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const keyed = /^\s*([\w-]+):[ \t]*(.*)$/.exec(line);
    const item = /^\s*-[ \t]+(.*)$/.exec(line);
    const name = keyed ? keyed[1] : `the line "${line.trim()}"`;
    const value = keyed ? keyed[2] : item ? item[1] : line.trim();
    if (keyed && /^[|>][+-]?\d*[ \t]*$/.test(value)) {
      blockIndent = indent;
      continue;
    }
    if (/^[\u201C\u201D\u2018\u2019]/.test(value)) {
      throw new Error(`${where}: ${name} starts with a curly quote. Use straight quotes (") instead: turn off smart quotes in your editor.`);
    }
    if (/^["']/.test(value)) {
      // Quoted text is kept whole; anything after the closing quote is dropped.
      const quoted = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')(.*)$/.exec(value);
      if (quoted && quoted[2].trim() !== '') {
        throw new Error(`${where}: ${name} has text after its closing quote, which is dropped. Put all of it inside the quotes.`);
      }
      continue;
    }
    // In a [list], items in double quotes are kept whole.
    const plain = value.startsWith('[') ? value.replace(/"(?:[^"\\]|\\.)*"/g, '""') : value;
    if (/(^|[ \t])#/.test(plain)) {
      throw new Error(
        `${where}: ${name} contains " #", which YAML treats as the start of a comment, so the rest of the line is cut off. Put the text in double quotes, or remove the comment.`,
      );
    }
  }
}

// A photo written in Markdown: ![description](./01.jpg), optionally with a "title".
const PHOTO = /!\[[^\]\n]*\]\(\s*<?([^\s<>)]+)>?(?:\s+"[^"\n]*")?\s*\)/g;

// Builds a post's id from its path, after checking the post file itself.
// Some mistakes are invisible once YAML has parsed the file (a rolled-over
// date, text cut off at " #"), so those checks read the file as written.
export function postId(collection: 'photos' | 'notes') {
  return ({ entry, base, data }: { entry: string; base: URL; data: Record<string, unknown> }) => {
    const where = `src/content/${collection}/${entry}`;
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/(en|ko)\.md$/.exec(entry);
    if (!match) {
      throw new Error(
        `${where}: a post must be <folder>/en.md or <folder>/ko.md, and the folder name may only use lowercase letters, numbers and hyphens.`,
      );
    }
    const [, folder, lang] = match;
    if (folder === 'dist' || folder === 'node_modules') {
      throw new Error(`${where}: "${folder}" is reserved for the site's own files. Name the folder something else.`);
    }
    const text = fs.readFileSync(new URL(entry, base), 'utf8');
    const parts = /^\uFEFF?(?:[ \t]*\r?\n)*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
    if (!parts) {
      throw new Error(`${where}: the file must start with a line of three dashes (---), then the fields, then another --- line.`);
    }
    const [, frontmatter, body] = parts;
    checkHashes(frontmatter, where);

    // As written, because YAML turns a folder name like 2026-10-18 into a date.
    const written = (name: string) => new RegExp(`^${name}:[ \\t]*(["']?)(.*?)\\1[ \\t]*$`, 'm').exec(frontmatter)?.[2];
    if (written('translationKey') !== folder) {
      throw new Error(`${where}: translationKey must be "${folder}", the same as the folder name.`);
    }
    if (data.lang !== lang) {
      throw new Error(`${where}: lang must be "${lang}", matching the file name.`);
    }
    const writtenDate = written('date');
    if (data.date instanceof Date && data.date.toISOString().slice(0, 10) !== writtenDate) {
      throw new Error(`${where}: date ${writtenDate} is not a real date. Write it like 2026-10-18, with no time.`);
    }

    // Photos must sit in the post's folder and be named exactly as on disk:
    // the Mac ignores upper/lower case, but GitHub's build does not.
    const files = fs.readdirSync(new URL(`${folder}/`, base));
    const checkPhoto = (ref: string, field: string) => {
      const name = /^\.\/([^/]+)$/.exec(ref)?.[1];
      if (!name) {
        throw new Error(`${where}: ${field} "${ref}" must be a photo in the post's folder, written like ./01.jpg.`);
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
        throw new Error(
          `${where}: ${field} "${ref}": photo file names may only use English letters, numbers, hyphens (-), underscores (_) and dots, like 01.jpg. Rename the file.`,
        );
      }
      if (!files.includes(name)) {
        const near = files.find((file) => file.toLowerCase() === name.toLowerCase());
        throw new Error(`${where}: there is no file named exactly "${name}" in the folder${near ? ` (there is "${near}"; upper and lower case must match)` : ''}.`);
      }
    };
    // Comments and code are not shown as photos, so they are left out.
    const shown = body.replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    if (/<img\b/i.test(shown)) {
      throw new Error(`${where}: write photos as ![description](./01.jpg), not with an <img> tag.`);
    }
    const photos: string[] = [];
    for (const line of shown.split(/\r?\n/)) {
      const found = [...line.matchAll(PHOTO)].map((m) => m[1]);
      if (found.length !== line.split('![').length - 1) {
        throw new Error(
          `${where}: "${line.trim()}" is not written the way a photo must be: ![description](./01.jpg), with both the ] and the ), and no spaces in the file name.`,
        );
      }
      photos.push(...found);
    }
    photos.forEach((ref) => checkPhoto(ref, 'photo'));
    if (typeof data.cover === 'string') checkPhoto(data.cover, 'cover');
    const link = data.link as { image?: unknown } | undefined;
    if (typeof link?.image === 'string') checkPhoto(link.image, 'link image');
    if (collection === 'photos' && photos.length === 0) {
      throw new Error(`${where}: a photo post needs at least one photo, written like ![description](./01.jpg).`);
    }
    return `${folder}/${lang}`;
  };
}
