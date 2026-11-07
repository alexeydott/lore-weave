// Техправка (#user-report 2026-11-07) — deterministic technical cleanup for the
// chapter editor. See the header comment in techEdits.ts for the mark-preserving
// rationale. This module owns the ProseMirror application: a single transaction
// that rewrites ONLY the changed text nodes (marks ride along via schema.text),
// applied END→START so positions stay valid, plus the blank-paragraph collapse.

import type { Editor } from '@tiptap/react';
import { transformTextNode, type TechEditPresetId } from './techEdits';

export interface RunTechTransformsOptions {
  presets: string[];
  find?: string;
  replace?: string;
}

/**
 * Runs the selected presets + custom find/replace across the document's text
 * nodes in ONE transaction. Returns the number of node-level replacements (0 =
 * nothing changed → the caller must NOT dispatch a no-op transaction, so no
 * phantom autosave/revision is written).
 */
export function runTechTransforms(
  editor: Editor,
  opts: RunTechTransformsOptions,
): number {
  const presetSet = new Set<string>(opts.presets);
  const tr = editor.state.tr;
  let total = 0;
  const replacements: Array<{ from: number; to: number; text: string; marks: readonly unknown[] }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const { text: newText } = transformTextNode(node.text, presetSet, opts.find, opts.replace);
    if (newText !== node.text) {
      replacements.push({ from: pos, to: pos + node.text.length, text: newText, marks: node.marks });
    }
  });

  // END→START so earlier positions stay valid as later ones are replaced.
  for (const r of replacements.reverse()) {
    tr.replaceWith(r.from, r.to, editor.schema.text(r.text, r.marks as never));
    total += 1;
  }

  if (total > 0) editor.view.dispatch(tr);
  return total;
}

/**
 * collapse_blank_paragraphs is BLOCK-level (not a text-node transform): deletes an
 * empty paragraph that directly follows another empty paragraph, scanning the
 * TOP-LEVEL children END→START. One consecutive run collapses to a single empty
 * paragraph instead of vanishing entirely (readable rhythm preserved).
 */
export function collapseBlankParagraphs(editor: Editor): number {
  const tr = editor.state.tr;
  const doc = editor.state.doc;
  const toDelete: number[] = [];
  doc.forEach((node, offset, index) => {
    if (node.type.name !== 'paragraph') return;
    const isEmpty = node.content.size === 0;
    const prev = index > 0 ? doc.child(index - 1) : null;
    const prevEmpty = prev !== null && prev.type.name === 'paragraph' && prev.content.size === 0;
    if (isEmpty && prevEmpty) toDelete.push(offset);
  });
  // END→START: positions of the earlier deletions stay valid.
  for (const pos of toDelete.reverse()) {
    tr.delete(pos, pos + 1);
  }
  if (toDelete.length > 0) editor.view.dispatch(tr);
  return toDelete.length;
}
