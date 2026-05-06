// C7 slice 2: per-language modes for agent-facing strings.
//
// This is intentionally minimal: a single string-table per language code, resolved at call
// time via the DENDRITE_LANG env var. The default is English. The framework is the
// deliverable here; translations ship as forks or follow-up PRs once a real operator asks
// for one.
//
// Storage rules stay English-only: memory bodies, wiki pages, claims, and project-log
// entries are never translated by this module. Only operator-facing message text (cluster
// templates, ritual reminders, hook output) is routed through the i18n table.
//
// Adding a new language:
// 1. Pick an ISO 639-1 code (zh, ja, es, fr, de, etc.).
// 2. Add an entry to the `translations` map below with the message keys you want to
//    localize. Missing keys fall back to English automatically.
// 3. Document the new code in docs/wiki/competitive-feature-roadmap.md (phase C7).

export type DendriteLangCode = string;

export type DendriteI18nKey =
  | 'observation-cluster-template-header'
  | 'observation-cluster-template-considerations'
  | 'observation-cluster-template-options-edit-or-read'
  | 'observation-cluster-template-options-default'
  | 'observation-cluster-template-replace-instruction';

export interface DendriteI18nMessageBundle {
  // Each entry is a function from interpolation values to string so callers can pass in
  // dynamic values (counts, paths) without forcing eager substitution at load time.
  [key: string]: (values: Record<string, string | number>) => string;
}

const englishMessages: DendriteI18nMessageBundle = {
  'observation-cluster-template-header': ({ kind, target, observationCount, distinctSessionCount, lastSeen }) =>
    `Recurring activity detected: ${kind} on ${target} (${observationCount} observation${observationCount === 1 ? '' : 's'} across ${distinctSessionCount} session${distinctSessionCount === 1 ? '' : 's'}, last seen ${lastSeen}).`,
  'observation-cluster-template-considerations': () =>
    'Consider documenting why this {kindLabel} keeps coming up — for example:',
  'observation-cluster-template-options-edit-or-read': () =>
    [
      '- a setup or onboarding gotcha future agents should know about',
      '- a refactoring target that has accumulated repeated edits',
      '- a frequently-broken integration or test',
      '- a workflow pattern worth promoting to a scope-bound skill'
    ].join('\n'),
  'observation-cluster-template-options-default': () =>
    [
      '- a setup or onboarding gotcha future agents should know about',
      '- a refactoring target that has accumulated repeated activity',
      '- a frequently-broken integration or test',
      '- a workflow pattern worth promoting to a scope-bound skill'
    ].join('\n'),
  'observation-cluster-template-replace-instruction': () =>
    'Replace this template text with the actual lesson, then optionally promote to a skill via memory_promote_skill once the lesson has been recalled enough times.'
};

// Sample non-English bundle — Spanish — so the routing has a real second path to test.
// Operators adding more languages should follow this exact shape.
const spanishMessages: DendriteI18nMessageBundle = {
  'observation-cluster-template-header': ({ kind, target, observationCount, distinctSessionCount, lastSeen }) =>
    `Actividad recurrente detectada: ${kind} en ${target} (${observationCount} observación${observationCount === 1 ? '' : 'es'} en ${distinctSessionCount} sesión${distinctSessionCount === 1 ? '' : 'es'}, vista por última vez ${lastSeen}).`,
  'observation-cluster-template-replace-instruction': () =>
    'Reemplaza este texto plantilla con la lección real y luego promociónalo a una skill mediante memory_promote_skill una vez que la lección haya sido recordada suficientes veces.'
};

const translations: Record<string, DendriteI18nMessageBundle> = {
  en: englishMessages,
  es: spanishMessages
};

export function resolveDendriteLang(env: NodeJS.ProcessEnv = process.env): DendriteLangCode {
  const raw = (env.DENDRITE_LANG ?? '').trim().toLowerCase();
  if (!raw) {
    return 'en';
  }
  // Accept full BCP-47 codes like en-US by stripping to the primary subtag.
  return raw.split('-')[0];
}

export function translate(
  key: DendriteI18nKey,
  values: Record<string, string | number> = {},
  options: { lang?: DendriteLangCode } = {}
): string {
  const lang = options.lang ?? resolveDendriteLang();
  const bundle = translations[lang];
  const fallback = translations.en;

  const localized = bundle?.[key];
  if (localized) {
    return localized(values);
  }

  const fallbackEntry = fallback?.[key];
  if (fallbackEntry) {
    return fallbackEntry(values);
  }

  // Never throw on a missing key — agent-facing surfaces would prefer to render the key
  // than fail. Operators can grep for any literal key in output to catch missing entries.
  return key;
}

// Public helper used in tests + by anyone who wants to inspect available languages.
export function listAvailableDendriteLangs(): DendriteLangCode[] {
  return Object.keys(translations).sort();
}
