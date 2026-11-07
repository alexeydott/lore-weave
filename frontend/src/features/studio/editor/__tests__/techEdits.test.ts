import { describe, it, expect } from 'vitest';
import { transformTextNode, dryRunTechEdits, splitScopeChunks, TECH_PRESETS } from '../techEdits';

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

  it('dryRunTechEdits counts structural blank-paragraph collapses (the dead-button case)', () => {
    // Flat getText() text: blocks joined by \n\n. Three consecutive empty
    // paragraphs between two non-empty ones = run of 8 newlines → k=3 empties
    // → 2 deletable. The ONLY selected preset is the structural one, whose
    // hits used to be invisible in the preview (0 → a dead Apply button).
    const flat = 'абзац один\n\n\n\n\n\n\n\nабзац два';
    const d = dryRunTechEdits(flat, set('collapse_blank_paragraphs'), undefined, undefined);
    expect(d.totalHits).toBe(2);
    expect(d.perPreset.collapse_blank_paragraphs).toBe(2);
    // A single blank line between paragraphs is kept (deletable 0).
    const kept = dryRunTechEdits('абзац один\n\n\n\nабзац два', set('collapse_blank_paragraphs'), undefined, undefined);
    expect(kept.totalHits).toBe(0);
  });

  it('empty selection of presets changes nothing', () => {
    const r = transformTextNode('а  б', set(), undefined, undefined);
    expect(r.text).toBe('а  б');
    expect(Object.keys(r.hits).length).toBe(0);
  });
});

describe('splitScopeChunks (the selection-edit 8000-char ceiling)', () => {
  it('keeps a short scope as one chunk', () => {
    expect(splitScopeChunks('короткий текст')).toEqual(['короткий текст']);
  });

  it('splits a whole chapter at paragraph boundaries under the ceiling', () => {
    const para = 'слово '.repeat(200).trim(); // ~1200 chars per paragraph
    const chapter = Array.from({ length: 20 }, () => para).join('\n\n'); // ~24k chars
    const chunks = splitScopeChunks(chapter);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(8000);
    // Paragraph-boundary split: rejoining with \n\n restores the chapter.
    expect(chunks.join('\n\n')).toBe(chapter);
  });

  it('hard-splits a single oversized paragraph at spaces', () => {
    const para = 'слово '.repeat(2000).trim(); // ~12000 chars, no \n\n
    const chunks = splitScopeChunks(para);
    expect(chunks.length).toBe(2);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(8000);
    expect(chunks.join(' ')).toBe(para);
  });
});
