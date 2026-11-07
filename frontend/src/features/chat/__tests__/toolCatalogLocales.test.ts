import { describe, it, expect } from 'vitest';
import { localizedToolDescription, localizedDomainLabel, localizedSkillLabel } from '../toolCatalogLocales';

describe('toolCatalogLocales (#user-report: the add-tools dialog showed raw English MCP strings)', () => {
  it('localizes a tool description for ru', () => {
    const d = localizedToolDescription('ru', 'composition_arc_apply', 'English fallback');
    expect(d).toContain('шаблон арки');
    expect(d).not.toBe('English fallback');
  });

  it('falls back to the catalog string for unknown tools and locales', () => {
    expect(localizedToolDescription('ru', 'tool_added_tomorrow', 'English fallback')).toBe('English fallback');
    expect(localizedToolDescription('en', 'composition_arc_apply', 'English fallback')).toBe('English fallback');
    expect(localizedToolDescription(undefined, 'composition_arc_apply', 'English fallback')).toBe('English fallback');
  });

  it('is base-code tolerant', () => {
    expect(localizedToolDescription('ru-RU', 'composition_arc_apply', 'English')).not.toBe('English');
  });

  it('localizes domain labels for chips and section headers', () => {
    expect(localizedDomainLabel('ru', 'composition')).toBe('Композиция');
    expect(localizedDomainLabel('ru', 'glossary')).toBe('Глоссарий');
    expect(localizedDomainLabel('en', 'composition')).toBe('composition');
    expect(localizedDomainLabel('ru', 'some_future_domain')).toBe('some_future_domain');
  });

  it('localizes skill labels with fallback', () => {
    expect(localizedSkillLabel('ru', 'plan_forge', 'PlanForge (novel planner)')).toContain('планировщик');
    expect(localizedSkillLabel('en', 'plan_forge', 'PlanForge (novel planner)')).toBe('PlanForge (novel planner)');
  });
});
