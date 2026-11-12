import { describe, it, expect } from 'vitest';
import { collectBlankDeletions, isBlankishParagraph, diffSegments, transformTextNode, dryRunTechEdits, splitScopeChunks, TECH_PRESETS } from '../techEdits';

// Minimal duck-typed PM node: children are reported through forEach like a
// real ProseMirror fragment.
function fakeParagraph(children: Array<{ isText?: boolean; type: string; text?: string }>, textContent = ''): Parameters<typeof isBlankishParagraph>[0] {
  return {
    type: { name: 'paragraph' },
    textContent,
    forEach(f: (child: { isText: boolean; type: { name: string } }) => void) {
      for (const c of children) f({ isText: !!c.isText, type: { name: c.type } });
    },
  };
}

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

  it('dryRunTechEdits counts only text-node hits (structural is the live doc\'s job)', () => {
    // Flat text cannot express empty paragraphs (textBetween hides them), so the
    // structural preset contributes NOTHING here — the dialog adds the live-doc
    // countBlankParagraphs on top (chapter-28 lesson).
    const d = dryRunTechEdits('абзац один\n\n\n\n\n\n\n\nабзац два', set('collapse_blank_paragraphs'), undefined, undefined);
    expect(d.totalHits).toBe(0);
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
    // Segments join back verbatim: the split is exactly lossless.
    expect(chunks.join('')).toBe(para);
  });

  it('hard-splits a spaceless CJK paragraph per character (ML-3)', () => {
    // No spaces at all: the old split(' ') kept this as one "word" and the
    // chunk went over the 8000 ceiling, so the endpoint 422d.
    const para = '这是一个很长的中文段落'.repeat(800); // 8800 chars, no spaces
    const chunks = splitScopeChunks(para);
    expect(chunks.length).toBe(2);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(8000);
    expect(chunks.join('')).toBe(para);
  });
});

describe('collectBlankDeletions (full node spans, selection guard)', () => {
  // Fake top-level doc: forEach reports (node, offset) like a ProseMirror fragment.
  // nodeSize mirrors PM: paragraph = content.size + 2 (open+close tokens); a
  // hardBreak leaf costs 1 — so a bare-<br> blank paragraph has nodeSize 3.
  function fakeDoc(children: Array<{ kind: 'empty' | 'br' | 'text' | 'image'; text?: string }>) {
    const nodes = children.map((c) => {
      const contentSize = c.kind === 'br' ? 1 : c.kind === 'image' ? 1 : c.kind === 'empty' ? 0 : (c.text ?? '').length;
      return {
        type: { name: c.kind === 'text' ? 'paragraph' : 'paragraph' },
        textContent: c.kind === 'br' ? '' : (c.text ?? ''),
        nodeSize: contentSize + 2,
        forEach(f: (child: { isText: boolean; type: { name: string } }) => void) {
          if (c.kind === 'br') f({ isText: false, type: { name: 'hardBreak' } });
          if (c.kind === 'image') f({ isText: false, type: { name: 'image' } });
        },
      };
    });
    return { forEach(f: (node: (typeof nodes)[number], offset: number) => void) {
      // PM fragment offsets are POSITIONS: each node starts at the accumulated
      // size of its predecessors (the first child at 0).
      let off = 0;
      for (const n of nodes) { f(n, off); off += n.nodeSize; }
    } };
  }

  it('collects FULL spans: a bare-<br> blank spans 3 positions, an empty one 2', () => {
    // offsets: text(0..7) br(7..10) empty(10..12) text(12..)
    const d = collectBlankDeletions(fakeDoc([{ kind: 'text', text: 'абзац' }, { kind: 'br' }, { kind: 'empty' }, { kind: 'text', text: 'два' }]));
    expect(d).toEqual([{ pos: 7, size: 3 }, { pos: 10, size: 2 }]);
  });

  it('keeps text and non-text visual paragraphs', () => {
    // offsets: text(0..7) image(7..10) br(10..13)
    const d = collectBlankDeletions(fakeDoc([{ kind: 'text', text: 'текст' }, { kind: 'image' }, { kind: 'br' }]));
    expect(d).toEqual([{ pos: 10, size: 3 }]);
  });

  it('selection guard keeps only paragraphs fully inside the range', () => {
    // para(0..9) blank(9..12) blank(12..15) para(15..27): a range covering only
    // the second blank (12..15) must collect exactly that one.
    const doc = fakeDoc([{ kind: 'text', text: '1234567' }, { kind: 'br' }, { kind: 'br' }, { kind: 'text', text: '12345678910' }]);
    const d = collectBlankDeletions(doc, { from: 12, to: 15 });
    expect(d).toEqual([{ pos: 12, size: 3 }]);
  });
});

describe('diffSegments (preview diff rows)', () => {
  it('finds a middle change with context on both sides', () => {
    const d = diffSegments('abc  def', 'abc def');
    expect(d).toEqual({ pre: 'abc ', removed: ' ', added: '', post: 'def' });
    // The row always reconstructs both strings.
    expect(d.pre + d.removed + d.post).toBe('abc  def');
    expect(d.pre + d.added + d.post).toBe('abc def');
  });

  it('handles a pure insertion', () => {
    const d = diffSegments('ab', 'aXb');
    expect(d).toEqual({ pre: 'a', removed: '', added: 'X', post: 'b' });
  });

  it('never renders a degenerate no-op (equal runs eat the diff)', () => {
    // Both greedy walks can meet inside equal runs; the change must stay visible.
    const d = diffSegments('один  два', 'один два');
    expect(d.removed.length + d.added.length).toBeGreaterThan(0);
    expect(d.pre + d.removed + d.post).toBe('один  два');
    expect(d.pre + d.added + d.post).toBe('один два');
  });
});

describe('isBlankishParagraph (chapter-28: blank lines are bare-<br> paragraphs)', () => {
  it('sees a truly empty paragraph as a blank line', () => {
    expect(isBlankishParagraph(fakeParagraph([]))).toBe(true);
  });

  it('sees a bare-<br> paragraph as a blank line (content.size > 0 — the old blind spot)', () => {
    expect(isBlankishParagraph(fakeParagraph([{ type: 'hardBreak' }]))).toBe(true);
    expect(isBlankishParagraph(fakeParagraph([{ type: 'hardBreak' }, { type: 'hardBreak' }]))).toBe(true);
  });

  it('sees whitespace/invisible-only paragraphs as blank lines', () => {
    expect(isBlankishParagraph(fakeParagraph([{ isText: true, type: 'text' }], '   '))).toBe(true);
    expect(isBlankishParagraph(fakeParagraph([{ isText: true, type: 'text' }], '\u200B\u00A0'))).toBe(true);
  });

  it('keeps paragraphs with any text', () => {
    expect(isBlankishParagraph(fakeParagraph([{ isText: true, type: 'text' }], 'привет'))).toBe(false);
    expect(isBlankishParagraph(fakeParagraph([{ isText: true, type: 'text' }, { type: 'hardBreak' }], 'привет'))).toBe(false);
  });

  it('keeps paragraphs with non-text visual nodes (an image is not a blank line)', () => {
    expect(isBlankishParagraph(fakeParagraph([{ type: 'image' }]))).toBe(false);
  });

  it('only ever answers for paragraphs', () => {
    expect(isBlankishParagraph({ type: { name: 'heading' }, textContent: '', forEach: () => {} })).toBe(false);
  });
});
