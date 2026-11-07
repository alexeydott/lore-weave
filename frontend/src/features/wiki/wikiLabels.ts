/**
 * Localized display layer for wiki ontology labels (#user-report 2026-11-07 —
 * the wiki rendered the System standards' English names: kind «Character»,
 * attribute labels «Name / Aliases / Gender / …»). The ontology NAMES are
 * DATA (System standard definitions seeded per genre); this layer only
 * overrides what the USER sees, keyed by the stable `code`, falling back to
 * the stored name for codes a locale doesn't cover (custom/user-authored
 * ontology rows keep their authored names — which may be any language).
 *
 * Coverage: the full System-standards vocabulary as seeded by
 * glossary-service (21 kind codes, 61 attribute codes, verified against the
 * live loreweave_glossary DB).
 */

const KIND_LABELS_RU: Record<string, string> = {
  character: 'Персонаж',
  colleague: 'Коллега',
  decision: 'Решение',
  event: 'Событие',
  item: 'Предмет / Реквизит',
  jargon: 'Жаргон',
  location: 'Локация',
  meeting: 'Встреча',
  org: 'Организация',
  organization: 'Организация',
  plot_arc: 'Сюжетная арка',
  power_system: 'Система сил (лестница уровней)',
  project: 'Проект',
  relationship: 'Отношение',
  social_setting: 'Социальная обстановка',
  species: 'Вид / Раса',
  task: 'Задача',
  technique: 'Техника / Искусство',
  terminology: 'Терминология',
  trope: 'Троп',
  unknown: 'Без вида',
  // legacy/extra codes seen in older imports
  creature: 'Существо',
  faction: 'Фракция',
  place: 'Место',
  region: 'Регион',
  concept: 'Концепция',
  lore: 'Лор',
  world: 'Мир',
  book: 'Книга',
  artifact: 'Артефакт',
};

const ATTR_LABELS_RU: Record<string, string> = {
  abilities: 'Способности',
  affiliation: 'Принадлежность',
  aliases: 'Псевдонимы',
  appearance: 'Внешность',
  arc_type: 'Тип арки',
  atmosphere: 'Атмосфера',
  capabilities: 'Возможности',
  category: 'Категория',
  chapters_span: 'Охват глав',
  class_hierarchy: 'Иерархия классов',
  culture: 'Культура',
  date_in_story: 'Дата в истории',
  definition: 'Определение',
  description: 'Описание',
  dynamic: 'Динамика',
  effects: 'Эффекты',
  emotional_beats: 'Эмоциональные биты',
  emotional_impact: 'Эмоциональное воздействие',
  emotional_wound: 'Эмоциональная рана',
  entry_requirement: 'Условие входа',
  era: 'Эпоха',
  gender: 'Пол',
  habitat: 'Среда обитания',
  headquarters: 'Штаб-квартира',
  how_manifested: 'Как проявляется',
  key_conflict: 'Ключевой конфликт',
  leader: 'Лидер',
  location: 'Расположение',
  love_language: 'Язык любви',
  members: 'Члены',
  name: 'Имя',
  occupation: 'Занятие',
  outcome: 'Исход',
  owner: 'Владелец',
  parent_location: 'Родительская локация',
  participants: 'Участники',
  parties: 'Стороны',
  personality: 'Характер',
  rank: 'Ранг',
  related_characters: 'Связанные персонажи',
  relationship_type: 'Тип отношения',
  relationships: 'Отношения',
  resolution: 'Развязка',
  role: 'Роль',
  romance_obstacles: 'Препятствия для романа',
  rules_norms: 'Правила и нормы',
  significance: 'Значимость',
  social_class: 'Социальное положение',
  stakes: 'Ставки',
  status: 'Статус',
  subverted: 'Переосмыслен?',
  symbolic_meaning: 'Символическое значение',
  term: 'Термин',
  tiers: 'Уровни',
  traits: 'Черты',
  trigger: 'Триггер',
  tropes: 'Тропы',
  turning_points: 'Поворотные точки',
  type: 'Тип',
  usage_note: 'Примечание по использованию',
  user: 'Использующий',
  // extra common codes
  age: 'Возраст',
  species: 'Вид',
  race: 'Раса',
  height: 'Рост',
  weight: 'Вес',
  eyes: 'Глаза',
  hair: 'Волосы',
  sex: 'Пол',
  background: 'Предыстория',
  summary: 'Аннотация',
  language: 'Язык',
  author: 'Автор',
  genre: 'Жанр',
  title: 'Название',
  population: 'Население',
  government: 'Правление',
  climate: 'Климат',
  terrain: 'Рельеф',
  religion: 'Религия',
  currency: 'Валюта',
  founder: 'Основатель',
  capital: 'Столица',
  material: 'Материал',
  origin: 'Происхождение',
  creator: 'Создатель',
  date: 'Дата',
  year: 'Год',
};

/**
 * The wiki generator bakes a references-section heading into the stored body.
 * The first cut shipped a Chinese heading (引用来源 · References) — localize the
 * KNOWN boilerplate headings at render so already-stored articles display in
 * the UI language without a regeneration.
 */
const WIKI_HEADING_RU: Record<string, string> = {
  '引用来源 · References': 'Источники',
  'References': 'Источники',
  'Источники': 'Источники',
};

export function localizedWikiHeading(locale: string | undefined, text: string): string {
  if (!text) return text;
  const base = (locale || '').split('-')[0];
  if (base === 'ru') return WIKI_HEADING_RU[text] ?? text;
  // Non-ru UIs: still swap the Chinese legacy heading for the English one.
  if (text.includes('引用来源')) return text.replace('引用来源 · ', '').replace('引用来源', 'References');
  return text;
}

/**
 * The regurgitation checker's evidence strings shipped CHINESE in the first
 * cut (loreweave_grounding/regurgitation.py, fixed to English in the SDK) —
 * but old flags are STORED in generation_provenance. Translate the known
 * template shapes at render so legacy rows read in the UI language; unknown
 * evidence passes through untouched. The current English templates also map
 * (a re-localization for future-proofing).
 */
const VERIFY_EVIDENCE_RU: Array<{ re: RegExp; to: string }> = [
  {
    // legacy high: 输出几乎整体复制授权来源原文表达（最长逐字 N 字，占输出 X%）— 非再创作，版权风险，自动拒绝
    re: /输出几乎整体复制授权来源原文表达（最长逐字 (\d+) 字，\s*占输出 (\d+%)）— 非再创作，版权风险，自动拒绝/,
    to: 'вывод практически дословно копирует выражения источника (макс. дословный фрагмент $1 симв., $2 вывода) — не переработка, риск нарушения авторских прав, автоотклонение',
  },
  {
    // legacy medium: 输出与来源有显著重合（最长逐字 N 字，n-gram 重合 X%）— 建议人工复核是否过度借用原文表达
    re: /输出与来源有显著重合（最长逐字 (\d+) 字，n-gram 重合\s*(\d+%)）— 建议人工复核是否过度借用原文表达/,
    to: 'значительное совпадение с источником (макс. дословный фрагмент $1 симв., n-gram перекрытие $2) — рекомендуется ручная проверка чрезмерного заимствования формулировок',
  },
  {
    // current English medium → ru
    re: /significant overlap with the source \(longest verbatim run (\d+) chars,\s*n-gram containment (\d+%)\) — manual review recommended for over-borrowing of the source wording/,
    to: 'значительное совпадение с источником (макс. дословный фрагмент $1 симв., n-gram перекрытие $2) — рекомендуется ручная проверка чрезмерного заимствования формулировок',
  },
  {
    // current English high → ru
    re: /output substantially copies verbatim source expression \(longest verbatim run (\d+) chars, (\d+%) of the output\) — not transformative; copyright risk, auto-reject/,
    to: 'вывод практически дословно копирует выражения источника (макс. дословный фрагмент $1 симв., $2 вывода) — не переработка, риск нарушения авторских прав, автоотклонение',
  },
];

export function localizedVerifyEvidence(locale: string | undefined, evidence: string): string {
  if (!evidence || !locale) return evidence;
  if ((locale || '').split('-')[0] !== 'ru') return evidence;
  let out = evidence;
  for (const { re, to } of VERIFY_EVIDENCE_RU) {
    if (re.test(out)) return out.replace(re, to);
  }
  return out;
}

/** Locale-gated flat lookup: the maps in this file are the RU overlay (one
 *  flat code → label table each); a non-ru locale falls straight through to
 *  the fallback. Base-code tolerant ('ru-RU' → 'ru'). */
function lookup(map: Record<string, string>, locale: string | undefined, code: string | undefined, fallback: string): string {
  if (!locale || !code) return fallback;
  if (!locale.split('-')[0].startsWith('ru')) return fallback;
  return map[code] ?? fallback;
}

export function localizedKindLabel(locale: string | undefined, kind: { code?: string; name: string } | undefined): string {
  if (!kind) return '';
  return lookup(KIND_LABELS_RU, locale, kind.code, kind.name);
}

export function localizedAttrLabel(
  locale: string | undefined,
  attrDef: { code?: string; name: string } | undefined,
): string {
  if (!attrDef) return '';
  return lookup(ATTR_LABELS_RU, locale, attrDef.code, attrDef.name);
}
