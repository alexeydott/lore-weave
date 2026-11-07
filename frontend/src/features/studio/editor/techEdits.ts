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

/** Dry-run: counts only, no mutation — the dialog's preview. */
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
