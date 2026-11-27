/**
 * Русские описания системных навыков для страницы «Расширения» (#user-report
 * 2026-11-27 — вкладка «Навыки» показывала сырые английские описания каталога).
 * Надстройка только для UI: описания в каталоге остаются английскими (их читает
 * агент), с фолбэком для навыков вне карты. Названия навыков локализует
 * localizedSkillLabel из features/chat/toolCatalogLocales.
 */
export const SKILL_DESCRIPTIONS_RU: Record<string, string> = {
  "glossary": "Глоссарий и лор-сущности: поиск, предложения, подтверждение правок.",
  "universal": "Сквозные рабочие процессы рукописи — базовая универсальная поверхность агента.",
  "knowledge": "Граф знаний, память и поиск по истории.",
  "admin": "Операции административного уровня (только админ-поверхность).",
  "plan_forge": "Планирование романа в системе PlanForge."
};

function lookupRu(m: Record<string, string>, locale: string | undefined, key: string, fallback: string): string {
  const base = locale?.split('-')[0];
  if (base !== 'ru') return fallback;
  return m[key] ?? fallback;
}

export function localizedSkillDescription(locale: string | undefined, slug: string, fallback: string): string {
  return lookupRu(SKILL_DESCRIPTIONS_RU, locale, slug, fallback);
}
