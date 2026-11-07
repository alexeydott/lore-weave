import { describe, it, expect } from 'vitest';
import { transformTextNode, dryRunTechEdits, TECH_PRESETS } from '../techEdits';

const set = (...ids: string[]) => new Set(ids as (typeof TECH_PRESETS)[number]['id'][]);

describe('techEdits transforms', () => {
  it('collapse_spaces folds repeated spaces and keeps single ones', () => {
    const r = transformTextNode('раз   два  три четыре', set('collapse_spaces'), undefined, undefined);
    expect(r.text).toBe('раз два три четыре');
    expect(r.hits.collapse_spaces).toBe(2);
  });

  it('space_before_punct removes spaces before punctuation only', () => {
    const r = transformTextNode('привет , мир ! и так .', set('space_before_punct'), undefined, undefined);
    expect(r.text).toBe('привет, мир! и так.');
    expect(r.hits.space_before_punct).toBe(3);
  });

  it('strip_invisible removes zero-width and soft hyphens', () => {
    const r = transformTextNode('по\u200Bси\u00ADх пор\uFEFF', set('strip_invisible'), undefined, undefined);
    expect(r.text).toBe('посих пор');
    expect(r.hits.strip_invisible).toBe(3);
  });

  it('unify_quotes wraps paired quotes into «…»', () => {
    const r = transformTextNode('он сказал "привет" и „пока"', set('unify_quotes'), undefined, undefined);
    expect(r.text).toBe('он сказал «привет» и «пока»');
    expect(r.hits.unify_quotes).toBeGreaterThan(0);
  });

  it('unify_dashes normalizes -- and – to em dash at word boundaries', () => {
    const r = transformTextNode('раз -- два – три', set('unify_dashes'), undefined, undefined);
    expect(r.text).toBe('раз — два — три');
  });

  it('custom find/replace replaces all occurrences and counts them', () => {
    const r = transformTextNode('Шлюндт и Шлюндт', set(), 'Шлюндт', 'Карл');
    expect(r.text).toBe('Карл и Карл');
    expect(r.hits.replace).toBe(2);
  });

  it('dryRunTechEdits counts without mutating', () => {
    const d = dryRunTechEdits('а  б  в', set('collapse_spaces'), undefined, undefined);
    expect(d.totalHits).toBe(2);
    expect(d.perPreset.collapse_spaces).toBe(2);
  });

  it('empty selection of presets changes nothing', () => {
    const r = transformTextNode('а  б', set(), undefined, undefined);
    expect(r.text).toBe('а  б');
    expect(Object.keys(r.hits).length).toBe(0);
  });
});
