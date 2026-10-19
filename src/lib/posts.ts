import { getCollection, type CollectionEntry } from 'astro:content';
import { localize, type Lang } from './i18n';
import { loadList } from './content-checks';

export type PhotoPost = CollectionEntry<'photos'>;
export type Note = CollectionEntry<'notes'>;
export type Post = PhotoPost | Note;

// Fields the English and Korean versions of a post must agree on, so that
// both languages list the post on the same index pages.
const sameInBoth = {
  photos: ['date', 'medium', 'camera', 'lens', 'film', 'filter', 'lab'],
  notes: ['date', 'gear'],
};

function field(post: Post, name: string) {
  return (post.data as Record<string, unknown>)[name];
}

// The post's folder name, which is also its translationKey and its address.
export function keyOf(post: Post) {
  return post.id.split('/')[0];
}

// A field in a form where list order doesn't matter. A film and its EI stay paired.
function comparable(post: Post, name: string) {
  if (name === 'film') {
    const ei = (field(post, 'ei') as number[] | undefined) ?? [];
    return ((field(post, 'film') as string[] | undefined) ?? []).map((film, i) => `${film} @ ${ei[i]}`).sort();
  }
  const value = field(post, name);
  return Array.isArray(value) ? [...value].sort() : value;
}

export function counterpart(post: Post, posts: Post[]) {
  return posts.find(
    (other) =>
      other.collection === post.collection && keyOf(other) === keyOf(post) && other.data.lang !== post.data.lang,
  );
}

export async function allPosts(): Promise<Post[]> {
  const photos = await getCollection('photos');
  const notes = await getCollection('notes');
  for (const photo of photos) {
    if (notes.some((note) => keyOf(note) === keyOf(photo))) {
      throw new Error(`"${keyOf(photo)}" is used by a photo post and a note. One of them is in the wrong folder.`);
    }
  }
  const posts: Post[] = [...photos, ...notes];
  for (const post of posts) {
    const other = post.data.lang === 'en' && counterpart(post, posts);
    if (!other) continue;
    for (const name of sameInBoth[post.collection]) {
      const en = JSON.stringify(comparable(post, name));
      const ko = JSON.stringify(comparable(other, name));
      if (en !== ko) {
        throw new Error(
          `${post.collection}/${keyOf(post)}: "${name}" is ${en} in en.md but ${ko} in ko.md. Both versions must match.`,
        );
      }
    }
  }
  return posts;
}

export function postUrl(post: Post) {
  return localize(post.data.lang, `/${post.collection}/${keyOf(post)}/`);
}

// One entry per post for a list in `lang`: the `lang` version when it
// exists, otherwise the other language's version, which the list labels.
export function forLang<T extends Post>(posts: T[], lang: Lang): T[] {
  const chosen = new Map<string, T>();
  for (const post of posts) {
    const key = `${post.collection}/${keyOf(post)}`;
    if (!chosen.has(key) || post.data.lang === lang) chosen.set(key, post);
  }
  return [...chosen.values()].sort(
    (a, b) =>
      b.data.date.valueOf() - a.data.date.valueOf() ||
      keyOf(a).localeCompare(keyOf(b)),
  );
}

// The owner's top stories, in the order listed in src/data/top-stories.json.
export function topStories(posts: Post[]) {
  return loadList('top-stories').map((key) => {
    const post = posts.find((p) => keyOf(p) === key);
    if (!post) throw new Error(`src/data/top-stories.json: there is no post with the folder name "${key}".`);
    return post;
  });
}

// Index pages: one per camera, lens, film, filter and year in use.
export const kinds = ['camera', 'lens', 'film', 'filter', 'year'] as const;
export type Kind = (typeof kinds)[number];

// A note's gear mixes cameras and lenses; the lists tell them apart.
const noteGear: Partial<Record<Kind, string[]>> = {
  camera: loadList('cameras'),
  lens: loadList('lenses'),
};

export function valuesOf(post: Post, kind: Kind): string[] {
  if (kind === 'year') return [String(post.data.date.getUTCFullYear())];
  if (post.collection === 'photos') return (field(post, kind) as string[] | undefined) ?? [];
  return (post.data.gear ?? []).filter((value) => noteGear[kind]?.includes(value));
}

export function slugify(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function indexUrl(lang: Lang, kind: Kind, value: string) {
  return localize(lang, `/${kind}/${slugify(value)}/`);
}
