/** Проверка, что название вакансии реально относится к поисковому запросу. */

const QUERY_ALIASES: Record<string, string[]> = {
  frontend: [
    'frontend',
    'front-end',
    'front end',
    'фронтенд',
    'фронтэнд',
    'фронт-енд',
    'javascript',
    'typescript',
  ],
  fullstack: ['fullstack', 'full-stack', 'full stack', 'фуллстек', 'фулстек'],
  react: ['react', 'react.js', 'reactjs'],
  typescript: ['typescript'],
  javascript: ['javascript'],
  vue: ['vue', 'vue.js', 'vuejs', 'nuxt'],
  angular: ['angular'],
  next: ['next.js', 'nextjs'],
};

/** Явный backend / не-фронт — не берём без сильного фронт-сигнала в title */
const HARD_EXCLUDE_TERMS = [
  'llm',
  'mlops',
  'llmops',
  'golang',
  ' go ',
  'java',
  'python',
  'c#',
  '.net',
  'asp.net',
  'php',
  'ruby',
  'rust',
  'kotlin',
  'scala',
  'devops',
  'sre',
  'data engineer',
  'ml engineer',
  'android',
  'ios',
  '1с',
  '1c',
  'c++',
  'с++',
  'аналитик',
  'analyst',
  'backend',
  'бэкенд',
  'бекенд',
  'node.js',
  'nodejs',
  'no-code',
];

/** QA / тест — никогда, даже с Fullstack в названии */
const ALWAYS_EXCLUDE_TERMS = [
  'qa',
  'aqa',
  'sdet',
  'тестировщик',
  'тестирование',
  'quality assurance',
  'автотест',
  'аналитик',
  'analyst',
  'product engineer',
  'engineering manager',
];

const STRONG_FRONT_TERMS = [
  'frontend',
  'front-end',
  'фронтенд',
  'фронтэнд',
  'react',
  'vue',
  'angular',
  'next.js',
  'nextjs',
  'nuxt',
  'svelte',
  'typescript',
  'javascript',
  'fullstack',
  'full-stack',
  'фуллстек',
  'фулстек',
  'верстальщик',
  'ui developer',
  'ui-developer',
  'web developer',
  'web-developer',
];

const FRONTISH_QUERY_TOKENS = new Set([
  'frontend',
  'react',
  'vue',
  'angular',
  'typescript',
  'javascript',
  'next',
  'fullstack',
]);

const NEEDS_STRONG_FRONT_TOKENS = new Set([
  'frontend',
  'react',
  'vue',
  'angular',
  'next',
  'javascript',
  'typescript',
]);

function expandToken(token: string): string[] {
  const key = token.toLowerCase();
  return QUERY_ALIASES[key] || [key];
}

/** Границы слов с учётом кириллицы (\b в JS её не понимает). */
function hasTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu');
  return re.test(haystack);
}

function hasAnyTerm(haystack: string, terms: string[]): boolean {
  return terms.some((term) => hasTerm(haystack, term));
}

function normalizeTitle(title: string): string {
  return ` ${title.toLowerCase().replace(/\s+/g, ' ').trim()} `;
}

export function titleMatchesQuery(title: string, query: string): boolean {
  const normalizedTitle = normalizeTitle(title);
  const tokens = query
    .toLowerCase()
    .split(/[\s,/+]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return true;

  // QA / аналитик — никогда
  if (hasAnyTerm(normalizedTitle, ALWAYS_EXCLUDE_TERMS)) {
    return false;
  }

  const matched = tokens.some((token) =>
    expandToken(token).some((alias) => normalizedTitle.includes(alias.toLowerCase())),
  );
  if (!matched) return false;

  const isFrontishQuery = tokens.some((t) => FRONTISH_QUERY_TOKENS.has(t));
  const hasStrongFront = hasAnyTerm(normalizedTitle, STRONG_FRONT_TERMS);
  const hasHardExclude = hasAnyTerm(normalizedTitle, HARD_EXCLUDE_TERMS);

  if (isFrontishQuery) {
    if (hasHardExclude && !hasStrongFront) return false;
    const needsStrongFront = tokens.some((t) => NEEDS_STRONG_FRONT_TOKENS.has(t));
    if (needsStrongFront && !hasStrongFront) return false;
  }

  return true;
}

export function titleMatchesAnyQuery(title: string, queries: string[]): boolean {
  return queries.some((q) => titleMatchesQuery(title, q));
}

export function partitionByTitleQuery<T extends { title: string }>(
  seen: T[],
  query: string,
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const item of seen) {
    if (titleMatchesQuery(item.title, query)) kept.push(item);
    else dropped.push(item);
  }
  return { kept, dropped };
}
