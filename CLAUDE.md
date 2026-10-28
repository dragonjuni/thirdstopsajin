# thirdstopsajin.com

Personal film photography blog: photos by roll, plus written notes (reviews, field tests, thoughts). The owner is tech-savvy but not a coder. Claude maintains all code; the owner writes posts in Markdown and supplies images.

This repo is public. Private context lives in `CLAUDE.local.md`, which must stay in `.gitignore`.

## Stack (decided; don't change without asking)

- Astro, static output. Pin the Astro version in `package.json`. Upgrade only for a concrete reason, and say what would break before doing it.
- Hosting: GitHub Pages, deployed by the official `withastro/action` workflow on every push to `main`. Pages source is set to GitHub Actions.
- Repo: `dragonjuni/thirdstopsajin` (public, which free GitHub Pages requires).
- Domain: `thirdstopsajin.com`, registered at Cloudflare Registrar, DNS on Cloudflare.
- No CMS, database, comments, analytics or trackers unless the owner asks. No paid services.

## Content model

Two content collections, both schema-validated. A missing or invalid field must fail the build. That is the point of the setup.

Each post is a folder, `src/content/<photos|notes>/<translationKey>/`, holding `en.md` and/or `ko.md` plus its photos. The build also fails if the folder name, `translationKey` and `lang` disagree, or if the two language versions differ on date or gear. Schemas are in `src/content.config.ts`, and checks that need the raw file (real dates, photo names, folder layout) are in `src/lib/content-checks.ts`. `README.md` is the owner's guide to writing posts. `npm run build` uses `--force` because Astro's content cache otherwise skips re-checking unchanged posts when a gear list changes, then runs `scripts/check-dist.mjs` to fail on broken links or photos.

Run `npm test` after changing any check, schema or photo hook. It tests each rule against good and bad sample posts in temporary copies of the project (`tests/`) and takes about a minute.

**`photos`**: photos with short captions. Usually a few frames from one roll, or a set mixing rolls and cameras, rarely a whole roll. (Was `rolls` until 2026-10-19, when the owner said posts won't be whole rolls.) Gear is recorded per post, not per photo (owner's choice, 2026-10-19). Each gear field takes one value or a list.
- `title`, `date`, `lang` (ko | en), `translationKey`
- `medium`: film and/or digital
- `camera`, `lens`: one or more
- `film`, `ei`: required when `medium` includes film; one EI per film, in the same order
- `filter`, `lab`: optional
- `location`: optional, free text
- `cover`: image

**`notes`**: writing, such as gear reviews, experiences, test results and opinions. This is a large part of the site, not an extra.
- `title`, `date`, `lang`, `translationKey`, `description`
- `cover`: optional image
- `gear`: optional list of camera / lens values the note is about. The owner chose to start with these and add other kinds later (2026-10-19).
- `tags`: optional

**Home page:** the owner's top stories first, in the order listed in `src/data/top-stories.json` (post folder names), then every other post, photos and writing mixed, newest first.

**Controlled vocabularies.** `camera`, `lens`, `film`, `filter` and `lab` must match lists in `src/data/`. A typo such as "E1OO" must fail the build instead of quietly creating a new tag. To add a value, add it to the list. Seed the lists from real posts only; never invent entries.

**Generated index pages:** one per camera, lens, film and filter, listing every post that used it (for example, every post with frames shot on E100 with an 81A), plus one per year.

## Languages

- Korean and English. Default (root) locale: **en** (decided by the owner, 2026-10-18). Korean lives under `/ko/`.
- A post does not need both versions. If it exists in one language only, the other language's lists still show it, labelled with its language. Never a 404.
- Translations are paired by `translationKey`. Each post links to its counterpart when one exists.
- Translations are AI-drafted and owner-reviewed. Use `glossary.md` for gear and process terms every time, and add to it whenever the owner corrects a term.

## Images

- The owner exports web JPEGs (about 2000px on the long edge, a few hundred KB each). Full-resolution scans never go in the repo.
- Strip location (GPS) metadata before an image is committed, because the repo is public. Check every new image. If one still has GPS data, don't commit it; tell the owner which file. `npm run check-photos` checks every file for GPS data and for full-resolution size. The pre-commit hook in `.githooks/` (enabled by `npm install`) runs the same check on staged files, and the deploy workflow runs it again as a backstop.
- Use Astro's image handling for responsive sizes.
- GitHub Pages caps a published site at 1 GB. Report the built site size once it passes 600 MB.

## Publishing rules

- Never commit drafts. A post enters the repo on the day it's published.
- Before any push that changes how the site looks, run the local preview and let the owner check it. Use `npm run build` then `npm run preview` for that check, not `npm run dev`, which can keep showing a stale page after an error.
- Design: plain, fast, photo-first, readable on a phone, with light and dark modes.
- No design iteration until three real posts are live.

## Working with the owner

- Explain changes in plain words, not code.
- When the owner has to run a command, give the exact text to copy and paste, with the explanation kept separate.
- When the owner has to click through a dashboard (GitHub, Cloudflare), guide them click by click.
- Write commit messages in plain English.

## Hosting (set up 2026-10-19)

- GitHub Pages source: GitHub Actions. Custom domain `thirdstopsajin.com`, verified at the account level; Enforce HTTPS is on. `www.thirdstopsajin.com` redirects to the bare domain.
- Cloudflare DNS: a TXT record `_github-pages-challenge-dragonjuni` (keep it permanently, or the domain loses verification), four A records for `thirdstopsajin.com` (185.199.108.153, .109.153, .110.153, .111.153) and a CNAME `www` → `dragonjuni.github.io`.
- Every A and CNAME record must stay **DNS only (grey cloud)**. Cloudflare's dashboard recommends proxying them; don't. A proxied record stops GitHub from renewing the HTTPS certificate.
- If the certificate ever stops being issued, remove and re-save the custom domain in the repo's Settings → Pages to restart GitHub's check.
