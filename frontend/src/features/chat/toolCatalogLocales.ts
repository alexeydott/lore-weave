/**
 * Localized display layer for the tool/skill catalogs (#user-report 2026-11-07
 * — the «Добавить инструменты или навыки» dialog rendered raw English MCP
 * descriptions). The MCP descriptions themselves stay English: they are the
 * LLM's tool specs — translating those would degrade tool-calling. This layer
 * only swaps what the USER sees, with a fallback to the catalog string for
 * tools/domains/skills a locale doesn't cover yet (e.g. tools added later).
 */
import { TOOL_DESCRIPTIONS_RU } from './toolDescriptions.ru';

const DOMAIN_LABELS_RU: Record<string, string> = {
  composition: 'Композиция',
  glossary: 'Глоссарий',
  knowledge: 'Знания',
  world: 'Миры',
  book: 'Книга',
  plan: 'План',
  settings: 'Настройки',
  translation: 'Перевод',
  registry: 'Реестр',
  jobs: 'Задания',
  meta: 'Метаданные',
  catalog: 'Каталог',
  confirm: 'Подтверждение',
  research: 'Исследование',
  story: 'История',
  memory: 'Память',
  lore: 'Лор',
  kg: 'Граф знаний',
  other: 'Другое',
};

const SKILL_LABELS_RU: Record<string, string> = {
  glossary: 'Глоссарий-ассистент',
  universal: 'Универсальный драйвер',
  knowledge: 'Граф знаний',
  plan_forge: 'PlanForge (планировщик романа)',
  co_write: 'Соавторство (черновик + материализация плана)',
  composition: 'Композиция (план, проза, канон, мотивы)',
  translation: 'Перевод',
  book: 'Книга (главы, ревизии, публикация)',
  settings: 'Настройки (профиль, провайдеры и модели)',
  jobs: 'Задания (контроль фоновых задач)',
};

const DESCRIPTION_MAPS: Record<string, Record<string, string>> = { ru: TOOL_DESCRIPTIONS_RU };
const DOMAIN_MAPS: Record<string, Record<string, string>> = { ru: DOMAIN_LABELS_RU };
const SKILL_LABEL_MAPS: Record<string, Record<string, string>> = { ru: SKILL_LABELS_RU };

/** Base-code tolerant map lookup ('ru-RU' → 'ru'), else the fallback. */
function lookup(maps: Record<string, Record<string, string>>, locale: string | undefined, key: string, fallback: string): string {
  if (!locale) return fallback;
  const base = locale.split('-')[0];
  return maps[locale]?.[key] ?? maps[base]?.[key] ?? fallback;
}

export function localizedToolDescription(locale: string | undefined, name: string, fallback: string): string {
  return lookup(DESCRIPTION_MAPS, locale, name, fallback);
}

export function localizedDomainLabel(locale: string | undefined, domain: string | undefined): string {
  const d = domain || 'other';
  return lookup(DOMAIN_MAPS, locale, d, d);
}

export function localizedSkillLabel(locale: string | undefined, id: string, fallback: string): string {
  return lookup(SKILL_LABEL_MAPS, locale, id, fallback);
}
