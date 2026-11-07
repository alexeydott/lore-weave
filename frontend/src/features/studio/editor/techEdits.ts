// Техправка (#user-report 2026-11-07) — deterministic technical cleanup for the
// chapter editor. The user asked for an AI-driven technical edit toolkit (whitespace,
// symbol removal, find→replace) with backup/restore. The DETERMINISTIC presets here are
// deliberately NOT AI: a mechanical cleanup must be reproducible and cannot hallucinate —
// the AI path handles open-ended tasks via the selection-edit stream (TechEditDialog's
// AI mode, operation 'rewrite' over the chapter) with the same checkpoint backup.
//
// MARK-PRESERVING: every transform runs inside ProseMirror text nodes (a regex replaces
// the node's text in one tr step), so bold/italic/etc. inside a cleaned paragraph
// survive. A naive whole-doc `replaceSelection(plainText)` would strip ALL marks.
//
// Each preset reports how many replacements it made, so the dialog can show an honest
// "nothing to fix" instead of a fake success.

export type TechEditPresetId =
  | 'collapse_spaces'
  | 'space_before_punct'
  | 'strip_invisible'
  | 'unify_quotes'
  | 'unify_dashes'
  | 'collapse_blank_paragraphs';

/** The selection-edit endpoint's rewrite ceiling (composition-service
 *  engine.py SELECTION_MAX_CHARS) — a whole-chapter selection used to 422 on
 *  it. The AI path chunks the scope text under this size. */
export const SELECTION_CEILING = 8000;

/** Split AI-scope text into ≤ SELECTION_CEILING chunks at paragraph (\n\n)
 *  boundaries; a single oversized paragraph degrades to a hard split at
 *  spaces. Pure — unit-tested alongside the transforms. */
export function splitScopeChunks(text: string): string[] {
  const hardSplit = (part: string): string[] => {
    if (part.length <= SELECTION_CEILING) return [part];
    const out: string[] = [];
    let cur = '';
    for (const word of part.split(' ')) {
      const candidate = cur ? cur + ' ' + word : word;
      if (candidate.length > SELECTION_CEILING && cur) {
        out.push(cur);
        cur = word;
      } else {
        cur = candidate;
      }
    }
    if (cur) out.push(cur);
    return out;
  };
  const chunks: string[] = [];
  let cur = '';
  for (const part of text.split('\n\n')) {
    for (const piece of hardSplit(part)) {
      const candidate = cur ? cur + '\n\n' + piece : piece;
      if (candidate.length > SELECTION_CEILING && cur) {
        chunks.push(cur);
        cur = piece;
      } else {
        cur = candidate;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export interface TechEditPreset {
  id: TechEditPresetId;
  /** i18n key under `editor.techEdit.presets`. */
  labelKey: string;
  /** English fallback for the label. */
  fallback: string;
}

export const TECH_PRESETS: TechEditPreset[] = [
  { id: 'collapse_spaces', labelKey: 'collapse_spaces', fallback: 'Collapse repeated spaces' },
  { id: 'space_before_punct', labelKey: 'space_before_punct', fallback: 'Remove spaces before punctuation' },
  { id: 'strip_invisible', labelKey: 'strip_invisible', fallback: 'Remove invisible characters' },
  { id: 'unify_quotes', labelKey: 'unify_quotes', fallback: 'Unify quotes to «…»' },
  { id: 'unify_dashes', labelKey: 'unify_dashes', fallback: 'Unify dashes to —' },
  { id: 'collapse_blank_paragraphs', labelKey: 'collapse_blank_paragraphs', fallback: 'Collapse repeated blank lines' },
];

export interface TechEditCounts {
  /** Per-preset replacement counts (id → nodes/occurrences touched). */
  byPreset: Partial<Record<TechEditPresetId, number>>;
  /** find→replace occurrences (custom rule). */
  replaced: number;
}

/** One row of the pre-apply preview («для параноиков»): what WILL change. */
export type TechEditPreviewItem =
  /** A text-node (or selected slice) rewrite — before/after of the affected span. */
  | { kind: 'text'; before: string; after: string }
  /** A blank-line paragraph that will be deleted, with neighbour context. */
  | { kind: 'blank'; prevText: string; nextText: string };

export type TechEditPreviewResult = {
  items: TechEditPreviewItem[];
  /** Node/slice-level text rewrites (what an apply will dispatch). */
  textTotal: number;
  /** Blank-line paragraphs an apply will delete. */
  blankTotal: number;
};

/** Splits before/after into {pre, removed, added, post} for inline diff rows.
 *  Greedy common prefix/suffix; the degenerate case (both walks meet inside
 *  equal runs, e.g. double→single space) gives the change one character so the
 *  row never renders as a no-op. */
export function diffSegments(before: string, after: string): { pre: string; removed: string; added: string; post: string } {
  const bl = before.length;
  const al = after.length;
  let s = 0;
  while (s < bl && s < al && before[s] === after[s]) s++;
  let e = 0;
  while (e < bl - s && e < al - s && before[bl - 1 - e] === after[al - 1 - e]) e++;
  let removed = before.slice(s, bl - e);
  const added = after.slice(s, al - e);
  if (!removed && !added && s > 0) {
    s -= 1;
    removed = before.slice(s, bl - e);
  }
  return { pre: before.slice(0, s), removed, added, post: before.slice(bl - e) };
}

const INVISIBLE = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g;
const MULTI_SPACE = / {2,}/g;
const SPACE_BEFORE_PUNCT = /[ \t]+([,.!?;:…])/g;
const DASHES = /(^|[\s([])(--|–)(?=[\s([]|$)/g;
const CURLY_DOUBLE = /[“”„“”«»]|("{2})/g;
const CURLY_SINGLE = /[‘’‚‘’]|('{2})/g;

/** Applies one regex transform to a text-node string; returns [newText, hits]. */
function sub(text: string, re: RegExp, to: string | ((m: string) => string)): [string, number] {
  let hits = 0;
  const out = text.replace(re, (...args) => {
    hits += 1;
    return typeof to === 'function' ? to(args[0] as string) : to;
  });
  return [out, hits];
}

function unifyQuotes(text: string): [string, number] {
  let hits = 0;
  let out = '';
  // Pairs: “…” / „…” / "…" → «…». Walk and flip the first of each pair.
  const pairRe = /[“”„"]([^“”"]*)[“”"]/g;
  out = text.replace(pairRe, (_m, inner: string) => {
    hits += 2;
    return '«' + inner + '»';
  });
  // Any leftover unpaired curly quotes → straight (rare, honest count).
  const singles = out.match(/[“”„“”]/g);
  if (singles) {
    hits += singles.length;
    out = out.replace(/[“”„“”]/g, '"');
  }
  return [out, hits];
}

function unifyDashes(text: string): [string, number] {
  let hits = 0;
  const out = text.replace(/(^|[\s([])(-{2,}|–|−)(?=[\s)(.,!?…]|$)/g, (_m, pre: string) => {
    hits += 1;
    return pre + '—';
  });
  return [out, hits];
}

/** Apply the selected presets + custom find/replace to ONE text-node string.
 *  `presets` is `Set<string>` on purpose: the caller passes user-facing checkbox
 *  ids through a string-keyed set (the dialog owns the typed vocabulary). */
export function transformTextNode(
  text: string,
  presets: Set<string>,
  find?: string,
  replace?: string,
): { text: string; hits: Partial<Record<TechEditPresetId | 'replace', number>> } {
  const hits: Partial<Record<TechEditPresetId | 'replace', number>> = {};
  let out = text;
  const bump = (k: TechEditPresetId | 'replace', n: number) => {
    hits[k] = (hits[k] ?? 0) + n;
  };
  if (presets.has('collapse_spaces')) {
    const [t, n] = sub(out, MULTI_SPACE, ' ');
    out = t;
    bump('collapse_spaces', n);
  }
  if (presets.has('space_before_punct')) {
    // A function replacer: the punctuation must be re-inserted literally — a string
    // '$1' would be parsed as a capture-group reference by String.replace.
    let n = 0;
    out = out.replace(SPACE_BEFORE_PUNCT, (_m: string, punct: string) => {
      n += 1;
      return punct;
    });
    bump('space_before_punct', n);
  }
  if (presets.has('strip_invisible')) {
    const [t, n] = sub(out, INVISIBLE, '');
    out = t;
    bump('strip_invisible', n);
  }
  if (presets.has('unify_quotes')) {
    const [t, n] = unifyQuotes(out);
    out = t;
    bump('unify_quotes', n);
  }
  if (presets.has('unify_dashes')) {
    const [t, n] = unifyDashes(out);
    out = t;
    bump('unify_dashes', n);
  }
  if (find) {
    const needle = find;
    let n = 0;
    out = out.split(needle).join(replace ?? '');
    // honest count: recount occurrences of the needle in the ORIGINAL node text
    let idx = 0;
    while ((idx = text.indexOf(needle, idx)) !== -1) {
      n += 1;
      idx += needle.length;
    }
    bump('replace', n);
  }
  return { text: out, hits };
}

/** A paragraph that RENDERS as a blank line: no textual content at all — truly
 *  empty, whitespace-only, or holding only hardBreak nodes. Imported manuscripts
 *  encode blank lines as paragraphs holding a bare <br>, which the naive
 *  content.size === 0 test does not see (a hardBreak is a leaf with size 1), and
 *  ProseMirror's textBetween() hides empty blocks entirely — so both the old
 *  collapse predicate and the flat-text preview were blind to them. A paragraph
 *  carrying any other visual node (image, mention, …) is NOT a blank line. */
export function isBlankishParagraph(node: {
  type: { name: string };
  textContent: string;
  forEach: (f: (child: { isText: boolean; type: { name: string } }) => void) => void;
}): boolean {
  if (node.type.name !== 'paragraph') return false;
  if (node.textContent.replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, '') !== '') return false;
  let blankish = true;
  node.forEach((child) => {
    if (child.isText) return; // its text was blank per the check above
    if (child.type.name === 'hardBreak') return;
    blankish = false;
  });
  return blankish;
}

/** Dry-run: counts only, no mutation — the dialog's preview. Covers the
 *  text-node presets; the structural blank-line count comes from the LIVE doc
 *  (countBlankParagraphs on the editor handle) because flat text cannot
 *  represent empty paragraphs at all. */
export function dryRunTechEdits(
  fullText: string,
  presets: Set<TechEditPresetId>,
  find?: string,
  replace?: string,
): { totalHits: number; perPreset: Partial<Record<TechEditPresetId | 'replace', number>> } {
  // Split the flat text into "node-like" chunks is unnecessary for a preview — the
  // same transforms are order-independent per node for these classes of edit.
  const { hits } = transformTextNode(fullText, presets, find, replace);
  const totalHits = Object.values(hits).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) || 0;
  return { totalHits, perPreset: hits };
}

/** Collects the blank-line paragraphs to delete, as FULL node spans {pos, size}
 *  (top-level children END→START-ready). `range` (a ProseMirror selection) keeps
 *  only paragraphs fully inside it. Deleting the FULL span matters: a bare-<br>
 *  blank paragraph has nodeSize 3 — a one-position delete would rip just the
 *  opening token and let ProseMirror's fitter merge the SURROUNDING text
 *  paragraphs (data loss). Duck-typed so unit tests can fake the doc. */
export function collectBlankDeletions(
  doc: { forEach: (f: (node: { type: { name: string }; textContent: string; nodeSize: number; forEach: Parameters<typeof isBlankishParagraph>[0]['forEach'] }, offset: number) => void) => void },
  range?: { from: number; to: number } | null,
): Array<{ pos: number; size: number }> {
  const out: Array<{ pos: number; size: number }> = [];
  doc.forEach((node, offset) => {
    if (!isBlankishParagraph(node)) return;
    if (range && (offset < range.from || offset + node.nodeSize > range.to)) return;
    out.push({ pos: offset, size: node.nodeSize });
  });
  return out;
}
