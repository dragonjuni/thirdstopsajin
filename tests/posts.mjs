// Tests the checks that stop a bad post from going out. Each case copies the
// project into a temporary folder, writes a set of test posts and gear lists,
// runs `npm run build` there, and checks that the build passes, or fails with
// the expected message. Run it with `npm test` after changing any check or
// schema. The project's own posts and lists are never touched.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'thirdstopsajin-posts-'));

// A plain web-sized JPEG, made fresh each run, with no GPS data.
const image = path.join(work, 'photo.jpg');
await sharp({ create: { width: 2000, height: 1333, channels: 3, background: { r: 110, g: 130, b: 150 } } })
  .jpeg()
  .toFile(image);
const PHOTO = Symbol('photo');

// ---------------------------------------------------------------------------
// The base set: a valid site that every case starts from.

const J = 'src/content/photos/2026-10-jeju-e100'; // English and Korean
const S = 'src/content/photos/2026-09-seoul-digital'; // English only, digital
const B = 'src/content/photos/2026-08-busan'; // Korean only
const M = 'src/content/photos/2026-07-mixed-set'; // two cameras, two films
const R = 'src/content/notes/2026-10-f3-review'; // English and Korean note
const K = 'src/content/notes/2026-06-ko-note'; // Korean-only note

const list = (items) => `${JSON.stringify(items, null, 2)}\n`;

const base = {
  'src/data/cameras.json': list(['Nikon F3', 'Leica M6', 'Ricoh GR III']),
  'src/data/lenses.json': list(['Nikkor 50mm f/1.4', 'Summicron 35mm f/2', 'GR 18.3mm f/2.8']),
  'src/data/films.json': list(['Kodak Ektachrome E100', 'Kodak Portra 400']),
  'src/data/filters.json': list(['81A']),
  'src/data/labs.json': list(['Test Lab']),
  'src/data/top-stories.json': list(['2026-07-mixed-set', '2026-10-f3-review']),

  [`${J}/en.md`]: `---
title: "Jeju on E100"
date: 2026-10-18
lang: en
translationKey: 2026-10-jeju-e100
medium: film
camera: Nikon F3
lens: Nikkor 50mm f/1.4
film: Kodak Ektachrome E100
ei: 100
filter: 81A
lab: Test Lab
location: "Jeju"
cover: ./01.jpg
---

![The harbour at dawn](./01.jpg)
The harbour at dawn.

![A stone wall](./02.jpg)
A stone wall.
`,
  [`${J}/ko.md`]: `---
title: "E100으로 찍은 제주"
date: 2026-10-18
lang: ko
translationKey: 2026-10-jeju-e100
medium: film
camera: Nikon F3
lens: Nikkor 50mm f/1.4
film: Kodak Ektachrome E100
ei: 100
filter: 81A
lab: Test Lab
location: "제주"
cover: ./01.jpg
---

![새벽 항구](./01.jpg)
새벽 항구.

![돌담](./02.jpg)
돌담.
`,
  [`${J}/01.jpg`]: PHOTO,
  [`${J}/02.jpg`]: PHOTO,

  [`${S}/en.md`]: `---
title: "Seoul, digital"
date: 2026-09-05
lang: en
translationKey: 2026-09-seoul-digital
medium: digital
camera: Ricoh GR III
lens: GR 18.3mm f/2.8
cover: ./01.jpg
---

![A street](./01.jpg)
A street.
`,
  [`${S}/01.jpg`]: PHOTO,

  [`${B}/ko.md`]: `---
title: "부산"
date: 2026-08-15
lang: ko
translationKey: 2026-08-busan
medium: film
camera: Leica M6
lens: Summicron 35mm f/2
film: Kodak Portra 400
ei: 400
cover: ./01.jpg
---

![바다](./01.jpg)
바다.
`,
  [`${B}/01.jpg`]: PHOTO,

  [`${M}/en.md`]: `---
title: "A mixed set"
date: 2026-07-01
lang: en
translationKey: 2026-07-mixed-set
medium: [film, digital]
camera: [Nikon F3, Ricoh GR III]
lens: [Nikkor 50mm f/1.4, GR 18.3mm f/2.8]
film: [Kodak Ektachrome E100, Kodak Portra 400]
ei: [100, 800]
cover: ./01.jpg
---

![On film](./01.jpg)
On film.

![On the GR](./02.jpg)
On the GR.
`,
  [`${M}/01.jpg`]: PHOTO,
  [`${M}/02.jpg`]: PHOTO,

  [`${R}/en.md`]: `---
title: "Six months with the F3"
date: 2026-10-20
lang: en
translationKey: 2026-10-f3-review
description: "What the F3 is like to use every day."
cover: ./cover.jpg
gear: [Nikon F3, Nikkor 50mm f/1.4]
tags: [review]
---

The F3 has been my everyday camera.

![The F3 on a table](./01.jpg)
`,
  [`${R}/ko.md`]: `---
title: "F3와 함께한 여섯 달"
date: 2026-10-20
lang: ko
translationKey: 2026-10-f3-review
description: "F3를 매일 쓰면 어떤지."
cover: ./cover.jpg
gear: [Nikon F3, Nikkor 50mm f/1.4]
tags: [리뷰]
---

F3는 내 일상 카메라였다.

![탁자 위의 F3](./01.jpg)
`,
  [`${R}/cover.jpg`]: PHOTO,
  [`${R}/01.jpg`]: PHOTO,

  [`${K}/ko.md`]: `---
title: "필름에 대한 생각"
date: 2026-06-10
lang: ko
translationKey: 2026-06-ko-note
description: "짧은 생각."
tags: [생각]
---

사진 없이 쓴 글.
`,
};

// ---------------------------------------------------------------------------
// Changes a case makes to the base set.

// Replaces the first `from` in a file. A missing `from` is a mistake in the test.
const edit = (file, from, to) => (files) => {
  if (typeof files[file] !== 'string' || !files[file].includes(from)) {
    throw new Error(`test setup: ${JSON.stringify(from)} is not in ${file}`);
  }
  files[file] = files[file].replace(from, to);
};
const set = (file, content) => (files) => {
  files[file] = content;
};
const remove = (file) => (files) => {
  if (!(file in files)) throw new Error(`test setup: ${file} is not in the base set`);
  delete files[file];
};
const rename = (from, to) => (files) => {
  remove(from)(files);
  files[to] = base[from];
};
// Moves every file of a post folder to another folder.
const move = (from, to) => (files) => {
  for (const file of Object.keys(files).filter((f) => f.startsWith(`${from}/`))) {
    files[`${to}${file.slice(from.length)}`] = files[file];
    delete files[file];
  }
};

const fails = (name, message, ...changes) => ({ name, message, changes });
const passes = (name, ...changes) => ({ name, changes });

// ---------------------------------------------------------------------------
// Checks on the site built from the base set. Returns a list of problems.

function checkBaseSite(dir) {
  const problems = [];
  const read = (page) => {
    const file = path.join(dir, 'dist', page);
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
    problems.push(`dist/${page} was not built`);
    return '';
  };
  const hrefs = (html) => [...html.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);

  // Home pages: top stories first, in the listed order, then everything
  // else newest first. A post in the other language only carries a label.
  const homes = {
    'index.html': {
      top: ['Top stories', '/photos/2026-07-mixed-set/', '/notes/2026-10-f3-review/'],
      recent: ['Recent', '/photos/2026-10-jeju-e100/', '/photos/2026-09-seoul-digital/', '/ko/photos/2026-08-busan/', '/ko/notes/2026-06-ko-note/'],
      labels: { '/ko/photos/2026-08-busan/': 'Korean', '/ko/notes/2026-06-ko-note/': 'Korean' },
    },
    'ko/index.html': {
      top: ['주요 글', '/photos/2026-07-mixed-set/', '/ko/notes/2026-10-f3-review/'],
      recent: ['최근 글', '/ko/photos/2026-10-jeju-e100/', '/photos/2026-09-seoul-digital/', '/ko/photos/2026-08-busan/', '/ko/notes/2026-06-ko-note/'],
      labels: { '/photos/2026-07-mixed-set/': '영어', '/photos/2026-09-seoul-digital/': '영어' },
    },
  };
  for (const [page, want] of Object.entries(homes)) {
    const sections = [...read(page).matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map((m) => m[1]);
    const got = sections.map((html) => [/<h2\b[^>]*>([^<]*)<\/h2>/.exec(html)?.[1], ...hrefs(html)]);
    const expected = [want.top, want.recent];
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      problems.push(`dist/${page} lists ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    }
    for (const item of read(page).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)) {
      const href = hrefs(item[1])[0];
      const label = /class="tag"[^>]*>([^<]*)</.exec(item[1])?.[1];
      if (label !== want.labels[href]) {
        problems.push(`dist/${page}: ${href} has the label ${JSON.stringify(label)}, expected ${JSON.stringify(want.labels[href])}`);
      }
    }
  }

  // Index pages, in both languages, each listing the posts that used the item.
  const indexes = {
    'camera/nikon-f3': ['/notes/2026-10-f3-review/', '/photos/2026-10-jeju-e100/', '/photos/2026-07-mixed-set/'],
    'lens/nikkor-50mm-f-1-4': ['/notes/2026-10-f3-review/', '/photos/2026-10-jeju-e100/', '/photos/2026-07-mixed-set/'],
    'film/kodak-ektachrome-e100': ['/photos/2026-10-jeju-e100/', '/photos/2026-07-mixed-set/'],
    'filter/81a': ['/photos/2026-10-jeju-e100/'],
    'year/2026': ['/notes/2026-10-f3-review/', '/photos/2026-10-jeju-e100/', '/photos/2026-09-seoul-digital/', '/ko/photos/2026-08-busan/', '/photos/2026-07-mixed-set/', '/ko/notes/2026-06-ko-note/'],
  };
  for (const [index, posts] of Object.entries(indexes)) {
    const listed = hrefs(read(`${index}/index.html`).split('<main>')[1] ?? '');
    if (JSON.stringify(listed) !== JSON.stringify(posts)) {
      problems.push(`dist/${index}/ lists ${JSON.stringify(listed)}, expected ${JSON.stringify(posts)}`);
    }
    read(`ko/${index}/index.html`);
  }

  // A mixed set shows each film with its own EI.
  const mixed = read('photos/2026-07-mixed-set/index.html').replace(/<[^>]*>/g, '');
  for (const film of ['Kodak Ektachrome E100 (EI 100)', 'Kodak Portra 400 (EI 800)']) {
    if (!mixed.includes(film)) problems.push(`dist/photos/2026-07-mixed-set/ does not show "${film}"`);
  }

  read('404.html');
  return problems;
}

// ---------------------------------------------------------------------------
// The cases.

const JE = `${J}/en.md`;
const JK = `${J}/ko.md`;
const ME = `${M}/en.md`;
const SE = `${S}/en.md`;
const RE = `${R}/en.md`;
const RK = `${R}/ko.md`;

const cases = [
  { ...passes('the base set builds, and the built site is right'), check: checkBaseSite },

  // After a good build, a changed gear list must be checked again: without
  // --force, Astro's cache skipped posts that had not changed themselves.
  {
    ...passes('a good build, then a gear list change'),
    then: fails('the next build checks the changed list', '"Leica M6" is not in src/data/cameras.json', set('src/data/cameras.json', list(['Nikon F3', 'Ricoh GR III']))),
  },

  // Missing, empty and numeric fields.
  fails('missing title', 'title: Required', edit(JE, 'title: "Jeju on E100"\n', '')),
  fails('empty title', 'title: is empty. Fill it in, or delete the line.', edit(JE, 'title: "Jeju on E100"', 'title:')),
  fails('title in empty quotes', 'title: is empty. Fill it in, or delete the line.', edit(JE, 'title: "Jeju on E100"', 'title: ""')),
  fails('missing date', 'date: Use a date written like 2026-10-18.', edit(SE, 'date: 2026-09-05\n', '')),
  fails('missing medium', 'medium: Required', edit(JE, 'medium: film\n', '')),
  fails('medium not film or digital', 'medium.0: Invalid option: expected one of "film"|"digital"', edit(JE, 'medium: film', 'medium: analog')),
  fails('missing camera', 'camera: Required', edit(JE, 'camera: Nikon F3\n', '')),
  fails('empty camera', 'camera: is empty. Fill it in, or delete the line.', edit(JE, 'camera: Nikon F3', 'camera:')),
  fails('empty camera list', 'camera: is empty. Fill it in, or delete the line.', edit(JE, 'camera: Nikon F3', 'camera: []')),
  fails('empty filter', 'filter: is empty. Fill it in, or delete the line.', edit(JE, 'filter: 81A', 'filter:')),
  fails('empty location', 'location: is empty. Fill it in, or delete the line.', edit(JE, 'location: "Jeju"', 'location:')),
  fails('missing cover on a photo post', 'cover: Required', edit(JE, 'cover: ./01.jpg\n', '')),
  fails('missing description on a note', 'description: Required', edit(RE, 'description: "What the F3 is like to use every day."\n', '')),
  fails('a number as a camera', '"3" is not in src/data/cameras.json', edit(JE, 'camera: Nikon F3', 'camera: 3')),
  fails('a number such as 1.0 as a lens', 'If it is a number such as 1.0, put it in double quotes.', edit(JE, 'lens: Nikkor 50mm f/1.4', 'lens: 1.0')),
  fails('EI written as text', 'ei.0: Expected type `"number"`, received `"string"`', edit(JE, 'ei: 100', 'ei: fast')),
  fails('EI not a whole number', 'ei.0: Expected type `"int"`, received `"number"`', edit(JE, 'ei: 100', 'ei: 100.5')),
  fails('EI of zero', 'ei.0: Too small: expected number to be >0', edit(JE, 'ei: 100', 'ei: 0')),

  // Dates that YAML would quietly turn into another date, or that carry a time.
  fails('30 February', 'date 2025-02-30 is not a real date', edit(SE, 'date: 2026-09-05', 'date: 2025-02-30')),
  fails('month 18', 'date 2026-18-10 is not a real date', edit(SE, 'date: 2026-09-05', 'date: 2026-18-10')),
  fails('year 1', 'date 0001-01-01 is not a real date', edit(SE, 'date: 2026-09-05', 'date: 0001-01-01')),
  fails('a date with a time', 'date 2026-10-18 10:00:00 is not a real date. Write it like 2026-10-18, with no time.', edit(SE, 'date: 2026-09-05', 'date: 2026-10-18 10:00:00')),
  fails('a date with a time and offset', 'date 2026-10-18T10:00:00+09:00 is not a real date', edit(SE, 'date: 2026-09-05', 'date: 2026-10-18T10:00:00+09:00')),
  fails('a quoted impossible date', 'date: Use a date written like 2026-10-18.', edit(SE, 'date: 2026-09-05', 'date: "2025-02-30"')),
  fails('a date written as words', 'date: Use a date written like 2026-10-18.', edit(SE, 'date: 2026-09-05', 'date: yesterday')),

  // lang and translationKey must agree with the file and folder.
  fails('lang ko in en.md', 'lang must be "en", matching the file name.', edit(JE, 'lang: en', 'lang: ko')),
  fails('lang en in ko.md', 'lang must be "ko", matching the file name.', edit(JK, 'lang: ko', 'lang: en')),
  fails('lang neither en nor ko', 'lang must be "en", matching the file name.', edit(JE, 'lang: en', 'lang: fr')),
  fails('missing lang', 'lang must be "en", matching the file name.', edit(JE, 'lang: en\n', '')),
  fails('translationKey not the folder name', 'translationKey must be "2026-10-jeju-e100", the same as the folder name.', edit(JE, 'translationKey: 2026-10-jeju-e100', 'translationKey: 2026-10-jeju')),
  fails('missing translationKey', 'translationKey must be "2026-10-jeju-e100"', edit(JE, 'translationKey: 2026-10-jeju-e100\n', '')),
  fails('folder name with capitals', 'the folder name may only use lowercase letters, numbers and hyphens', move(J, 'src/content/photos/2026-10-Jeju-E100')),
  fails('folder name with an underscore', 'the folder name may only use lowercase letters, numbers and hyphens', move(J, 'src/content/photos/2026_10_jeju')),

  // Film and EI.
  fails('film post without film', 'film: is required when medium includes film.', edit(JE, 'film: Kodak Ektachrome E100\n', '')),
  fails('film post without EI', 'ei: is required when medium includes film.', edit(JE, 'ei: 100\n', '')),
  fails('digital post with film', 'film: is only allowed when medium includes film.', edit(SE, 'medium: digital\n', 'medium: digital\nfilm: Kodak Portra 400\n')),
  fails('digital post with EI', 'ei: is only allowed when medium includes film.', edit(SE, 'medium: digital\n', 'medium: digital\nei: 400\n')),
  fails('fewer EIs than films', 'needs one number per film, in the same order: there are 2 films and 1 EI values.', edit(ME, 'ei: [100, 800]', 'ei: [100]')),
  fails('more EIs than films', 'needs one number per film, in the same order: there are 1 films and 2 EI values.', edit(JE, 'ei: 100', 'ei: [100, 200]')),

  // Gear names must match the lists exactly.
  fails('camera typo', '"Nikon F 3" is not in src/data/cameras.json', edit(JE, 'camera: Nikon F3', 'camera: Nikon F 3')),
  fails('lens typo', '"Nikkor 50mm f1.4" is not in src/data/lenses.json', edit(JE, 'lens: Nikkor 50mm f/1.4', 'lens: Nikkor 50mm f1.4')),
  fails('film typo', '"Kodak Ektachrome E1OO" is not in src/data/films.json', edit(JE, 'film: Kodak Ektachrome E100', 'film: Kodak Ektachrome E1OO')),
  fails('filter typo', '"81 A" is not in src/data/filters.json', edit(JE, 'filter: 81A', 'filter: 81 A')),
  fails('lab typo', '"Test Labs" is not in src/data/labs.json', edit(JE, 'lab: Test Lab', 'lab: Test Labs')),
  fails('note gear typo', '"Nikon F4" is not in src/data/cameras.json or lenses.json', edit(RE, 'gear: [Nikon F3,', 'gear: [Nikon F4,')),
  fails('camera in the wrong case', '"nikon f3" is not in src/data/cameras.json', edit(JE, 'camera: Nikon F3', 'camera: nikon f3')),
  fails('camera with a trailing space', '"Nikon F3 " is not in src/data/cameras.json', edit(JE, 'camera: Nikon F3', 'camera: "Nikon F3 "')),
  fails('film in a list with a trailing space', '"Kodak Portra 400 " is not in src/data/films.json', edit(ME, 'Kodak Portra 400]', '"Kodak Portra 400 "]')),
  fails('camera with a non-breaking space', '"Nikon\\u00a0F3" is not in src/data/cameras.json', edit(JE, 'camera: Nikon F3', 'camera: Nikon F3')),
  fails('the same camera twice', 'camera: lists the same item twice.', edit(ME, 'camera: [Nikon F3, Ricoh GR III]', 'camera: [Nikon F3, Nikon F3]')),

  // Unknown fields, such as a misspelled field name.
  fails('unknown field on a photo post', 'Unrecognized key: "photographer"', edit(JE, 'cover:', 'photographer: me\ncover:')),
  fails('misspelled field on a note', 'Unrecognized key: "gears"', edit(RE, 'gear:', 'gears:')),

  // Photos must exist in the post's folder, named exactly as written.
  fails('cover file missing', 'there is no file named exactly "missing.jpg" in the folder', edit(JE, 'cover: ./01.jpg', 'cover: ./missing.jpg')),
  fails('body photo missing', 'there is no file named exactly "03.jpg" in the folder', edit(JE, '](./02.jpg)', '](./03.jpg)')),
  fails('photo post without photos', 'a photo post needs at least one photo', set(SE, base[SE].replace('![A street](./01.jpg)\n', ''))),
  fails('photo name in the wrong case', 'there is no file named exactly "02.JPG" in the folder (there is "02.jpg"; upper and lower case must match)', edit(JE, '](./02.jpg)', '](./02.JPG)')),
  fails('cover name in the wrong case', 'there is no file named exactly "01.JPG" in the folder (there is "01.jpg"', edit(JE, 'cover: ./01.jpg', 'cover: ./01.JPG')),
  fails('Korean photo name', 'photo file names may only use English letters, numbers, hyphens', edit(JE, '](./02.jpg)', '](./사진.jpg)'), set(`${J}/사진.jpg`, PHOTO)),
  fails('photo name with a space', 'is not written the way a photo must be', edit(JE, '](./02.jpg)', '](./my photo.jpg)'), set(`${J}/my photo.jpg`, PHOTO)),
  fails('photo name with a space, in angle brackets', 'is not written the way a photo must be', edit(JE, '](./02.jpg)', '](<./my photo.jpg>)'), set(`${J}/my photo.jpg`, PHOTO)),
  fails('photo in another folder', 'must be a photo in the post\'s folder, written like ./01.jpg', edit(JE, '](./02.jpg)', '](../2026-09-seoul-digital/01.jpg)')),
  fails('photo from another website', 'must be a photo in the post\'s folder, written like ./01.jpg', edit(JE, '](./02.jpg)', '](https://example.com/02.jpg)')),
  fails('an <img> tag', 'not with an <img> tag', edit(JE, '![A stone wall](./02.jpg)', '<img src="./02.jpg" alt="A stone wall">')),
  fails('photo missing its )', 'is not written the way a photo must be', edit(JE, '](./02.jpg)', '](./02.jpg')),
  fails('photo missing its ]', 'is not written the way a photo must be', edit(JE, '![A stone wall](./02.jpg)', '![A stone wall(./02.jpg)')),

  // YAML cuts text off at an unquoted " #".
  fails('unquoted " #" in a title', 'title contains " #"', edit(JE, 'title: "Jeju on E100"', 'title: Jeju roll #1')),
  fails('unquoted " #" in a block-list item', 'the line "- Nikon F3 #main" contains " #"', edit(JE, 'camera: Nikon F3', 'camera:\n  - Nikon F3 #main')),
  fails('" #" after a closing quote', 'title has text after its closing quote', edit(JE, 'title: "Jeju on E100"', 'title: "Jeju on E100" #1')),
  fails('curly quotes', 'title starts with a curly quote', edit(JE, 'title: "Jeju on E100"', 'title: “Jeju on E100”')),

  // Folder layout.
  fails('a .markdown file', `${J}/en.markdown: a post folder may only hold en.md, ko.md and photos`, rename(JE, `${J}/en.markdown`)),
  fails('EN.MD in capitals', `${J}/EN.MD: a post folder may only hold en.md, ko.md and photos`, rename(JE, `${J}/EN.MD`)),
  fails('a stray text file', `${J}/notes.txt: a post folder may only hold`, set(`${J}/notes.txt`, 'notes')),
  fails('a folder inside a post folder', `${J}/extra: a post folder may only hold`, set(`${J}/extra/03.jpg`, PHOTO)),
  fails('a folder with only photos', 'src/content/photos/2026-05-only-photos: the folder has no en.md or ko.md.', set('src/content/photos/2026-05-only-photos/01.jpg', PHOTO)),
  fails('a post file outside a folder', 'src/content/photos/draft.md: put each post in its own folder.', set('src/content/photos/draft.md', base[JE])),
  fails('a wrong collection folder', 'src/content/rolls: only the folders photos and notes belong in src/content.', move(J, 'src/content/rolls/2026-10-jeju-e100')),
  fails('dist as a folder name', '"dist" is reserved for the site\'s own files', move(S, 'src/content/photos/dist'), edit('src/content/photos/dist/en.md', 'translationKey: 2026-09-seoul-digital', 'translationKey: dist')),

  // Gear lists and top stories in src/data/.
  fails('broken JSON', 'src/data/cameras.json could not be read', set('src/data/cameras.json', '["Nikon F3", "Leica M6", "Ricoh GR III",]\n')),
  fails('a list that is not a list', 'src/data/films.json must be a list in square brackets', set('src/data/films.json', '{"film": "Kodak Portra 400"}\n')),
  fails('a name listed twice', 'src/data/lenses.json: "Summicron 35mm f/2" is listed twice.', set('src/data/lenses.json', list(['Nikkor 50mm f/1.4', 'Summicron 35mm f/2', 'GR 18.3mm f/2.8', 'Summicron 35mm f/2']))),
  fails('a name with a trailing space', 'src/data/filters.json: "81A " is not a clean name', set('src/data/filters.json', list(['81A ']))),
  fails('a number in a list', 'src/data/films.json: 400 is not a clean name', set('src/data/films.json', '["Kodak Ektachrome E100", "Kodak Portra 400", 400]\n')),
  fails('an empty name in a list', 'src/data/labs.json: "" is not a clean name', set('src/data/labs.json', list(['Test Lab', '']))),
  fails('a name in both cameras and lenses', '"Ricoh GR III" is in both src/data/cameras.json and src/data/lenses.json', set('src/data/lenses.json', list(['Nikkor 50mm f/1.4', 'Summicron 35mm f/2', 'GR 18.3mm f/2.8', 'Ricoh GR III']))),
  fails('broken top-stories.json', 'src/data/top-stories.json could not be read', set('src/data/top-stories.json', '["2026-07-mixed-set" "2026-10-f3-review"]\n')),
  fails('an unknown top story', 'src/data/top-stories.json: there is no post with the folder name "2026-07-mixed"', set('src/data/top-stories.json', list(['2026-07-mixed', '2026-10-f3-review']))),
  fails('a top story listed twice', 'src/data/top-stories.json: "2026-07-mixed-set" is listed twice.', set('src/data/top-stories.json', list(['2026-07-mixed-set', '2026-10-f3-review', '2026-07-mixed-set']))),

  // The two language versions must agree.
  fails('translations disagree on date', 'photos/2026-10-jeju-e100: "date" is', edit(JK, 'date: 2026-10-18', 'date: 2026-10-19')),
  fails('translations disagree on camera', 'photos/2026-10-jeju-e100: "camera" is', edit(JK, 'camera: Nikon F3', 'camera: Leica M6')),
  fails('translations disagree on film', 'photos/2026-10-jeju-e100: "film" is', edit(JK, 'film: Kodak Ektachrome E100', 'film: Kodak Portra 400')),
  fails('translations disagree on EI', 'photos/2026-10-jeju-e100: "film" is', edit(JK, 'ei: 100', 'ei: 200')),
  fails('translations disagree on filter', 'photos/2026-10-jeju-e100: "filter" is', edit(JK, 'filter: 81A\n', '')),
  fails('translations disagree on note gear', 'notes/2026-10-f3-review: "gear" is', edit(RK, 'gear: [Nikon F3, Nikkor 50mm f/1.4]', 'gear: [Nikon F3]')),
  fails(
    'translation swaps films but not EIs',
    'photos/2026-07-mixed-set: "film" is',
    set(`${M}/ko.md`, base[ME].replace('lang: en', 'lang: ko').replace('film: [Kodak Ektachrome E100, Kodak Portra 400]', 'film: [Kodak Portra 400, Kodak Ektachrome E100]')),
  ),
  fails('the same folder name in photos and notes', '"2026-10-jeju-e100" is used by a photo post and a note', set('src/content/notes/2026-10-jeju-e100/en.md', base[RE].replace(/2026-10-f3-review/, '2026-10-jeju-e100').replace('cover: ./cover.jpg\n', '').replace('![The F3 on a table](./01.jpg)\n', ''))),

  // check-dist: links in the built site.
  fails('link to a folder without a page', 'links to /camera/, which does not exist', edit(RE, 'everyday camera.', 'everyday [camera](/camera/).')),
  fails('link in the wrong letter case', 'links to /Photos/2026-10-jeju-e100/, which does not exist', edit(RE, 'everyday camera.', 'everyday camera, as in [Jeju](/Photos/2026-10-jeju-e100/).')),
  fails('link to a missing page', 'links to /photos/2026-10-jeju/, which does not exist', edit(RE, 'everyday camera.', 'everyday camera, as in [Jeju](/photos/2026-10-jeju/).')),
  fails('link with a broken percent escape', 'is not a valid address', edit(RE, 'everyday camera.', 'everyday camera, as in [Jeju](/photos/%E0%A4/).')),

  // Things that look odd but are fine.
  passes('a date-named folder', move(S, 'src/content/photos/2026-10-18'), edit('src/content/photos/2026-10-18/en.md', 'translationKey: 2026-09-seoul-digital', 'translationKey: 2026-10-18')),
  passes('a leading-zero folder', move(S, 'src/content/photos/007'), edit('src/content/photos/007/en.md', 'translationKey: 2026-09-seoul-digital', 'translationKey: 007')),
  passes('a quoted translationKey', edit(JE, 'translationKey: 2026-10-jeju-e100', 'translationKey: "2026-10-jeju-e100"')),
  passes('a space after the opening ---', edit(JE, '---\n', '--- \n')),
  passes('a number as a title', edit(SE, 'title: "Seoul, digital"', 'title: 1984')),
  passes('a number as a tag', edit(RE, 'tags: [review]', 'tags: [2026, review]')),
  passes('" #" inside quotes', edit(JE, 'title: "Jeju on E100"', 'title: "Jeju roll #1"'), edit(JE, 'location: "Jeju"', "location: 'Jeju #2'")),
  passes(
    'block-style lists',
    edit(ME, 'medium: [film, digital]', 'medium:\n  - film\n  - digital'),
    edit(ME, 'camera: [Nikon F3, Ricoh GR III]', 'camera:\n  - Nikon F3\n  - Ricoh GR III'),
    edit(ME, 'film: [Kodak Ektachrome E100, Kodak Portra 400]', 'film:\n  - Kodak Ektachrome E100\n  - Kodak Portra 400'),
    edit(ME, 'ei: [100, 800]', 'ei:\n  - 100\n  - 800'),
  ),
  passes('a photo with a title', edit(JE, '](./02.jpg)', '](./02.jpg "A stone wall")')),
  passes(
    'translations list gear in a different order',
    set(
      `${M}/ko.md`,
      base[ME]
        .replace('lang: en', 'lang: ko')
        .replace('camera: [Nikon F3, Ricoh GR III]', 'camera: [Ricoh GR III, Nikon F3]')
        .replace('film: [Kodak Ektachrome E100, Kodak Portra 400]', 'film: [Kodak Portra 400, Kodak Ektachrome E100]')
        .replace('ei: [100, 800]', 'ei: [800, 100]'),
    ),
  ),
  passes('.DS_Store files', set('src/content/.DS_Store', ''), set('src/content/photos/.DS_Store', ''), set(`${J}/.DS_Store`, '')),
  passes(
    'code spans, code blocks and // links',
    edit(
      RE,
      'everyday camera.',
      'everyday camera. Write `![a photo](./missing.jpg)`, not `<img src="./missing.jpg">` or `[x](/missing/)`.\n\n```\n![a photo](./missing.jpg)\n```\n\nSee [this](//example.com/page).',
    ),
  ),
];

// The link card is a newer feature; its cases run once it is in the project.
if (fs.existsSync(path.join(root, 'src/components/LinkCard.astro'))) {
  const card = (fields) => edit(RE, 'tags: [review]\n', `tags: [review]\nlink:\n${fields}`);
  const good = '  url: "https://example.com/article"\n  title: "An article"\n  summary: "What it says."\n  source: "Example News"\n';
  cases.push(
    passes('a link card', card(`${good}  image: ./card.jpg\n`), set(`${R}/card.jpg`, PHOTO)),
    fails('link card with an http address', 'must be a full web address starting with https://', card(good.replace('https:', 'http:'))),
    fails('link card without a title', 'link.title: Required', card(good.replace('  title: "An article"\n', ''))),
    fails('link card with an unknown field', 'Unrecognized key: "author"', card(`${good}  author: "Someone"\n`)),
    fails('link card image missing', 'there is no file named exactly "card.jpg" in the folder', card(`${good}  image: ./card.jpg\n`)),
  );
} else {
  console.log('Skipping the link card cases: src/components/LinkCard.astro does not exist yet.');
}

// ---------------------------------------------------------------------------
// Running the cases.

// Writes the files that differ from `before` into a project copy.
function writeFiles(dir, files, before = {}) {
  for (const file of Object.keys(before)) {
    if (!(file in files)) fs.rmSync(path.join(dir, file));
  }
  for (const [file, content] of Object.entries(files)) {
    if (before[file] === content) continue;
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (content === PHOTO) fs.copyFileSync(image, target);
    else fs.writeFileSync(target, content);
  }
}

// A copy of the project without its build output, caches and posts, or
// .claude/, which can hold whole copies of the project (Claude's worktrees).
function copyProject(dir) {
  const skip = new Set(['node_modules', 'dist', '.astro', '.git', '.claude', 'src/content'].map((p) => path.join(root, p)));
  fs.cpSync(root, dir, { recursive: true, filter: (src) => !skip.has(src) });
  // Astro keeps its cache in node_modules/.astro, so each copy gets its own
  // node_modules folder, whose entries link back to the project's. Builds
  // running side by side would otherwise share one cache.
  fs.mkdirSync(path.join(dir, 'node_modules'));
  for (const name of fs.readdirSync(path.join(root, 'node_modules'))) {
    if (name === '.astro' || name === '.vite') continue;
    fs.symlinkSync(path.join(root, 'node_modules', name), path.join(dir, 'node_modules', name));
  }
}

function build(dir) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'build'], { cwd: dir, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
    let output = '';
    child.stdout.on('data', (data) => (output += data));
    child.stderr.on('data', (data) => (output += data));
    const timer = setTimeout(() => child.kill(), 5 * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ passed: code === 0, output: output.replace(/\x1b\[[0-9;]*m/g, '') });
    });
  });
}

// Builds a case's files. Returns what went wrong, or nothing.
async function buildAndCheck(dir, test, files, before) {
  test.changes.forEach((change) => change(files));
  writeFiles(dir, files, before);
  const { passed, output } = await build(dir);
  const tail = `\n    ${output.trim().split('\n').slice(-15).join('\n    ')}`;
  if (test.message === undefined) {
    if (!passed) return `the build failed, but should have passed:${tail}`;
    const problems = test.check ? test.check(dir) : [];
    if (problems.length > 0) return `the built site is wrong:\n    ${problems.join('\n    ')}`;
    return test.then && buildAndCheck(dir, test.then, files, { ...files });
  }
  if (passed) return `the build passed, but should have failed with: ${test.message}`;
  if (!output.includes(test.message)) return `the build failed, but without the message: ${test.message}${tail}`;
}

async function runCase(test) {
  const dir = fs.mkdtempSync(path.join(work, 'case-'));
  try {
    copyProject(dir);
    const problem = await buildAndCheck(dir, test, { ...base });
    if (!problem) fs.rmSync(dir, { recursive: true, force: true });
    return problem && `${problem}\n    (files kept in ${dir})`;
  } catch (error) {
    return `${error.stack}\n    (files kept in ${dir})`;
  }
}

const started = Date.now();
const jobs = Math.max(1, Math.min(8, Math.floor(os.availableParallelism() / 2)));
const failures = [];
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < cases.length) {
      const test = cases[next++];
      const problem = await runCase(test);
      done += 1;
      const status = problem ? 'FAIL' : 'ok  ';
      console.log(`${status} ${String(done).padStart(3)}/${cases.length}  ${test.name}`);
      if (problem) failures.push(`${test.name}: ${problem}`);
    }
  }),
);

const seconds = Math.round((Date.now() - started) / 1000);
if (failures.length > 0) {
  console.error(`\n${failures.length} of ${cases.length} post cases failed (${seconds}s):\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`\nAll ${cases.length} post cases passed (${seconds}s).`);
