import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { checkContentFolder, checkNoOverlap, loadList, postId, show } from './lib/content-checks';

// Every rule here fails the build when broken. That is the point: a typo
// such as "E1OO" must stop a post from going out, not create a new tag.

checkContentFolder();

const cameras = loadList('cameras');
const lenses = loadList('lenses');
const films = loadList('films');
const filters = loadList('filters');
const labs = loadList('labs');
checkNoOverlap({ cameras, lenses });

// A value that must appear in one of the gear lists in src/data/.
function listed(list: string[], where: string) {
  return z.preprocess(
    // YAML reads `filter: 25` as a number; the lists hold text. Korean and
    // accented names can be stored in two ways, so compare one form.
    (value) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.normalize('NFC') : value),
    z.enum(list, {
      error: (issue) => {
        if (issue.input === undefined) return undefined; // Zod's own "required" message
        if (issue.input === null) return 'is empty. Fill it in, or delete the line.';
        const number = /^[\d.]+$/.test(String(issue.input)) ? ' If it is a number such as 1.0, put it in double quotes.' : '';
        return `${show(issue.input)} is not in ${where}. Fix the spelling, or add it to that list if it is new.${number}`;
      },
    }),
  );
}

// One value or a list of them, such as `camera: Nikon F3` or
// `camera: [Nikon F3, Leica M6]`. Either way the post gets a list.
function oneOrMore<T extends z.ZodType>(item: T) {
  return z.preprocess(
    // A blank line (null) becomes an empty list, so it gets the "is empty" message.
    (value) => (value === null ? [] : value === undefined || Array.isArray(value) ? value : [value]),
    z
      .array(item)
      .min(1, 'is empty. Fill it in, or delete the line.')
      .refine((list) => new Set(list).size === list.length, 'lists the same item twice.'),
  );
}

// Text such as a title. A number is taken as text, and a blank line gets a plain message.
const text = z.preprocess(
  (value) => (typeof value === 'number' ? String(value) : value),
  z
    .string({ error: (issue) => (issue.input === null ? 'is empty. Fill it in, or delete the line.' : undefined) })
    .trim()
    .min(1, 'is empty. Fill it in, or delete the line.'),
);

const date = z.union([z.date(), z.iso.date().transform((value) => new Date(value))], {
  error: 'Use a date written like 2026-10-18.',
});

const shared = {
  title: text,
  date,
  lang: z.enum(['en', 'ko']),
  // Checked against the folder name, as written, in postId(). Pages use the
  // folder name, since YAML can read a name like 2026-10-18 as a date.
  translationKey: z.unknown(),
};

// A photo post: a few frames from one roll, or a set mixing rolls and
// cameras. Its gear is listed for the post as a whole.
const photos = defineCollection({
  loader: glob({ base: './src/content/photos', pattern: '**/*.md', generateId: postId('photos') }),
  schema: ({ image }) =>
    // Strict objects reject unknown fields, so a misspelled field name fails too.
    z
      .strictObject({
        ...shared,
        medium: oneOrMore(z.enum(['film', 'digital'])),
        camera: oneOrMore(listed(cameras, 'src/data/cameras.json')),
        lens: oneOrMore(listed(lenses, 'src/data/lenses.json')),
        film: oneOrMore(listed(films, 'src/data/films.json')).optional(),
        ei: oneOrMore(z.number().int().positive()).optional(),
        filter: oneOrMore(listed(filters, 'src/data/filters.json')).optional(),
        lab: oneOrMore(listed(labs, 'src/data/labs.json')).optional(),
        location: text.optional(),
        cover: image(),
      })
      .superRefine((post, ctx) => {
        const problem = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
        if (!post.medium.includes('film')) {
          if (post.film) problem('film', 'is only allowed when medium includes film.');
          if (post.ei) problem('ei', 'is only allowed when medium includes film.');
          return;
        }
        if (!post.film) problem('film', 'is required when medium includes film.');
        if (!post.ei) problem('ei', 'is required when medium includes film.');
        if (post.film && post.ei && post.film.length !== post.ei.length) {
          problem('ei', `needs one number per film, in the same order: there are ${post.film.length} films and ${post.ei.length} EI values.`);
        }
      }),
});

const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/*.md', generateId: postId('notes') }),
  schema: ({ image }) =>
    z.strictObject({
      ...shared,
      description: text,
      cover: image().optional(),
      gear: oneOrMore(listed([...cameras, ...lenses], 'src/data/cameras.json or lenses.json')).optional(),
      tags: z.array(text).optional(),
      // An article elsewhere, such as one written for KJD, shown as a card.
      link: z
        .strictObject({
          url: z.string().regex(/^https:\/\/\S+$/, 'must be a full web address starting with https://'),
          title: text,
          summary: text,
          source: text,
          // The language the linked article is written in.
          lang: z.enum(['en', 'ko']).default('en'),
          // The card's picture: either a photo in the post's folder, or the
          // linked site's own picture, shown from its server. Without
          // either, the card uses the cover.
          image: image().optional(),
          imageUrl: z.string().regex(/^https:\/\/\S+$/, 'must be a full web address starting with https://').optional(),
        })
        .refine((link) => !(link.image && link.imageUrl), 'use either image or imageUrl, not both.')
        .optional(),
    }),
});

export const collections = { photos, notes };
