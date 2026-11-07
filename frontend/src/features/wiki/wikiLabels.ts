/**
 * Localized display layer for wiki ontology labels (#user-report 2026-11-07 —
 * the wiki rendered the System standards' English names: kind «Character»,
 * attribute labels «Name / Aliases / Gender / …»). The ontology NAMES are
 * DATA (System standard definitions); this layer only overrides what the USER
 * sees, keyed by the stable `code`, falling back to the stored name for codes
 * a locale doesn't cover (custom/user-authored ontology rows keep their
 * authored names — which may be any language).
 */

const KIND_LABELS_RU: Record<string, string> = {
  character: 'Персонаж',
  location: 'Локация',
  organization: 'Организация',
  faction: 'Фракция',
  item: 'Предмет',
  artifact: 'Артефакт',
  concept: 'Концепция',
  event: 'Событие',
  creature: 'Существо',
  species: 'Вид',
  place: 'Место',
  region: 'Регион',
  technique: 'Техника',
  term: 'Термин',
  lore: 'Лор',
  world: 'Мир',
  book: 'Книга',
};

const ATTR_LABELS_RU: Record<string, string> = {
  name: 'Имя',
  term: 'Термин',
  aliases: 'Псевдонимы',
  alias: 'Псевдоним',
  gender: 'Пол',
  sex: 'Пол',
  role: 'Роль',
  occupation: 'Занятие',
  social_class: 'Социальное положение',
  social_status: 'Социальное положение',
  affiliation: 'Принадлежность',
  appearance: 'Внешность',
  personality: 'Характер',
  emotional_wound: 'Эмоциональная рана',
  relationships: 'Отношения',
  description: 'Описание',
  age: 'Возраст',
  species: 'Вид',
  race: 'Раса',
  height: 'Рост',
  weight: 'Вес',
  eyes: 'Глаза',
  hair: 'Волосы',
  status: 'Статус',
  abilities: 'Способности',
  skills: 'Навыки',
  equipment: 'Снаряжение',
  weapons: 'Оружие',
  weakness: 'Слабости',
  goals: 'Цели',
  motivation: 'Мотивация',
  background: 'Предыстория',
  history: 'История',
  summary: 'Аннотация',
  language: 'Язык',
  author: 'Автор',
  genre: 'Жанр',
  title: 'Название',
  population: 'Население',
  government: 'Правление',
  climate: 'Климат',
  terrain: 'Рельеф',
  culture: 'Культура',
  religion: 'Религия',
  currency: 'Валюта',
  leader: 'Лидер',
  members: 'Члены',
  founder: 'Основатель',
  location: 'Расположение',
  capital: 'Столица',
  material: 'Материал',
  origin: 'Происхождение',
  creator: 'Создатель',
  owner: 'Владелец',
  date: 'Дата',
  year: 'Год',
  era: 'Эпоха',
};

/** Base-code tolerant map lookup ('ru-RU' → 'ru'), else the fallback. */
function lookup(map: Record<string, string>, locale: string | undefined, code: string | undefined, fallback: string): string {
  if (!locale || !code) return fallback;
  const base = locale.split('-')[0];
  return map[locale]?.[code] ?? map[base]?.[code] ?? fallback;
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
