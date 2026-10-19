# thirdstopsajin.com

A film photography blog: photo posts, plus writing such as gear reviews and experiences. It is built with [Astro](https://astro.build) and published to GitHub Pages on every push to `main`.

English pages are at the root and Korean pages are under `/ko/`.

## Writing a post

Each post is a folder named after the post. The folder name becomes the web address, and it must use only lowercase letters, numbers and hyphens, for example `2026-10-jeju-e100`.

- **Photo posts** go in `src/content/photos/<folder>/`
- **Notes** (reviews, experiences and other writing) go in `src/content/notes/<folder>/`

Inside the folder, put `en.md`, `ko.md` or both, plus the photos. Both language versions share the same photos.

### A photo post (`en.md`)

```markdown
---
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
lab: Name of the lab
location: "Jeju"
cover: ./cover.jpg
---

![What the photo shows](./01.jpg)
The caption goes on the line right under the photo.

![What the next photo shows](./02.jpg)
Next caption.
```

- `translationKey` is the folder name, and `lang` is `en` in `en.md` and `ko` in `ko.md`.
- Write the date as year-month-day, with no time.
- Put titles, locations and descriptions in double quotes. Without them, a `#` or a colon can cut the text short or break the post.
- `filter`, `lab` and `location` are optional. Leave the line out if there is nothing to say.
- `film` and `ei` are required when the post has film photos, and not allowed when it is all digital.

For a set that mixes gear, list everything the post used. Give one EI per film, in the same order:

```markdown
medium: [film, digital]
camera: [Nikon F3, Leica M6]
lens: [Nikkor 50mm f/1.4, Summicron 35mm f/2]
film: [Kodak Ektachrome E100, Kodak Portra 400]
ei: [100, 800]
```
- The English and Korean versions must agree on the date and all the gear.

### A note (`en.md`)

```markdown
---
title: "Six months with the F3"
date: 2026-10-18
lang: en
translationKey: 2026-10-f3-review
description: "One or two sentences shown in lists."
cover: ./cover.jpg
gear: [Nikon F3, Nikkor 50mm f/1.4]
tags: [review]
---

The text of the note. Photos can go in the text too:

![What the photo shows](./01.jpg)
```

`cover`, `gear` and `tags` are optional. `gear` lists the cameras and lenses the note is about, and the note then appears on their pages.

### Gear names

`camera`, `lens`, `film`, `filter` and `lab` must match a name in the lists in `src/data/` exactly. A typo stops the site from building, so it can't go out by mistake. To use a new camera, film and so on, add its name to the right list first.

Each camera, lens, film and filter gets its own page listing every post that uses it, and so does each year.

### Top stories

The home page starts with the posts listed in `src/data/top-stories.json`, in that order, by folder name:

```json
["2026-10-f3-review", "2026-10-jeju-e100"]
```

Everything else follows, newest first.

### Photos

- Export JPEGs at about 2000px on the long side. Never put full-resolution scans in the repository.
- Remove location (GPS) data when exporting. The repository is public.
- Name photo files with English letters, numbers and hyphens only, such as `01.jpg` (no spaces, no Korean), and write them in the post exactly as named: `./01.jpg`.
- The cover is one of the photos in the folder. Every photo post needs at least one photo in its text.
- Screenshots count too: shrink any image over about 2000px with `sips -Z 2000 <file>`.
- On a computer where `npm install` has run, a commit that adds a photo with GPS data, or one far bigger than 2000px, is blocked. Never add photos through GitHub's website, which skips that check.

## Commands

Once per computer, install the tool that checks photos for location data:

```sh
brew install exiftool
```

Install everything once, after downloading the project:

```sh
npm install
```

Preview the site while writing, at http://localhost:4321:

```sh
npm run dev
```

If the preview shows "Page not found" or doesn't change after an edit, look at the terminal for the error. After adding photos to a post, save its `.md` file again.

Build the site exactly as it will be published:

```sh
npm run build
```

Check every photo for GPS data and size:

```sh
npm run check-photos
```
