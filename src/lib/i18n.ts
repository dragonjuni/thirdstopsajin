export const langs = ['en', 'ko'] as const;
export type Lang = (typeof langs)[number];

// The Korean strings are AI-drafted. Check them against glossary.md.
export const ui = {
  en: {
    siteName: 'thirdstopsajin',
    ownName: 'English',
    readThisIn: 'Read in English',
    langLabel: { en: 'English', ko: 'Korean' },
    topStories: 'Top stories',
    recent: 'Recent',
    camera: 'Camera',
    lens: 'Lens',
    film: 'Film',
    filter: 'Filter',
    year: 'Year',
    lab: 'Lab',
    location: 'Location',
    digital: 'Digital',
    nothingYet: 'Nothing here yet.',
  },
  ko: {
    siteName: 'thirdstopsajin',
    ownName: '한국어',
    readThisIn: '한국어로 읽기',
    langLabel: { en: '영어', ko: '한국어' },
    topStories: '주요 글',
    recent: '최근 글',
    camera: '카메라',
    lens: '렌즈',
    film: '필름',
    filter: '필터',
    year: '연도',
    lab: '현상소',
    location: '장소',
    digital: '디지털',
    nothingYet: '아직 글이 없습니다.',
  },
} as const;

export function otherLang(lang: Lang): Lang {
  return lang === 'en' ? 'ko' : 'en';
}

// English pages sit at the root, Korean pages under /ko/.
export function localize(lang: Lang, path: string) {
  return lang === 'en' ? path : `/ko${path}`;
}

// The [...lang] route parameter: absent for English, "ko" for Korean.
export function langParam(lang: Lang) {
  return lang === 'en' ? undefined : lang;
}

export function formatDate(date: Date, lang: Lang) {
  return date.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
