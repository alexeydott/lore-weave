// 24 H3 / PH16 / PH20 — the drawer's EDIT surface.
//
// PH16's click contract, fixed: "the drawer edits the DESIRED state; 'Open in Editor' goes to the
// ACTUAL." So every control here writes the spec (`outline_node`); none of them touches prose.
//
// Every write is OCC'd on the node `version` (If-Match) and settles by RELOADING — a 412 means
// someone else moved the row, and we say so rather than clobbering them.
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { OutlineNode } from '@/features/composition/types';

import type { NodeEdit } from '../api';

/**
 * MIRRORS the server's closed set — SoT: `NodeStatus` in composition-service `app/db/models.py`
 * (`Literal["empty","outline","drafting","done"]`). A free-text status box here would be the
 * Frontend-Tool-Contract bug exactly: the write 422s, or worse, a typo'd value slips through some
 * looser path and nothing renders it. Adding a status server-side without adding it here shows up as
 * a select whose current value is missing — visible, not silent.
 */
export const NODE_STATUSES = ['empty', 'outline', 'drafting', 'done'] as const;
export type NodeStatusValue = (typeof NODE_STATUSES)[number];

export interface PlanDrawerEditProps {
  node: OutlineNode;
  /** The book's chapters, for the ⚓ re-anchor picker. */
  chapters: { chapter_id: string; title: string; sort_order: number }[];
  /** The chapter spine could not be read. With an empty list the select would show
   *  "— not anchored —" as the SELECTED option for an ANCHORED node — a confident lie about its
   *  state. We disable the picker and say so instead. */
  chaptersError?: boolean;
  onEdit: (patch: NodeEdit) => void;
  onArchive: () => void;
  onRestore: () => void;
  /** PH16 — go to the ACTUAL (the manuscript). Disabled when the node has no anchor to go to. */
  onOpenInEditor: (chapterId: string) => void;
  saving: boolean;
}

/** A text field that commits on blur / Enter — not on every keystroke. A per-keystroke write would
 *  bump `version` on each character and 412 itself on the next one. */
function CommitField({
  label,
  value,
  testid,
  multiline,
  numeric,
  onCommit,
  disabled,
}: {
  label: string;
  value: string;
  testid: string;
  multiline?: boolean;
  numeric?: boolean;
  onCommit: (v: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  // T13 — DIRTY means "the user has typed here and it is not saved yet". Without it this
  // component silently DESTROYED unsaved text, and it is a data-loss shape, not a staleness one.
  //
  // The sequence a 2026-09-06 run hit: type a 1686-character Goal, move to Synopsis and save that.
  // The sibling save re-renders this drawer from the server, `value` for Goal arrives as its
  // last-SAVED content (empty), and the re-sync effect below overwrote the user's draft with it.
  // Worse than losing the save: `commit` then sees `draft === value` and never writes, so the text
  // is gone with no error anywhere. Confirmed against the API — the field really was "".
  //
  // The policy is the same one T4 applied to the manuscript hoist (G7): a keystroke the user has
  // not saved is THEIRS, and no background refresh may overwrite it. Solving these two the same
  // way was deliberate — two mechanisms for one rule is how they drift apart.
  const dirty = useRef(false);

  // Re-sync when the row changes underneath (a reload, a 412 recovery, a different selection).
  // This is synchronisation with an external value, not event-handling — a legitimate useEffect.
  useEffect(() => {
    // …but NEVER over a dirty field. An external change while the user is mid-edit is a conflict,
    // and the resolution is to keep what they typed — they can still see and re-commit it, whereas
    // a clobbered draft is unrecoverable.
    if (dirty.current) return;
    setDraft(value);
  }, [value]);

  const onType = (next: string) => {
    dirty.current = true;
    setDraft(next);
  };

  const commit = () => {
    // Cleared FIRST: once committed, the value is the server's business again, so the next
    // external change (including the echo of this very save) is free to re-sync.
    dirty.current = false;
    if (draft !== value) onCommit(draft);
  };

  const cls = 'w-full rounded border bg-background px-1.5 py-1 text-xs disabled:opacity-50';
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {multiline ? (
        <textarea
          data-testid={testid}
          aria-label={label}
          className={cn(cls, 'min-h-[3rem] resize-y')}
          value={draft}
          disabled={disabled}
          onChange={(e) => onType(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          data-testid={testid}
          aria-label={label}
          type={numeric ? 'number' : 'text'}
          min={numeric ? 0 : undefined}
          max={numeric ? 100 : undefined}
          className={cls}
          value={draft}
          disabled={disabled}
          onChange={(e) => onType(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      )}
    </div>
  );
}

export function PlanDrawerEdit({
  node,
  chapters,
  chaptersError,
  onEdit,
  onArchive,
  onRestore,
  onOpenInEditor,
  saving,
}: PlanDrawerEditProps) {
  // BPS-13 — the two NULL-anchor states are NOT the same thing, and conflating them is the bug this
  // surfaces: "not yet written" is the normal life of a fresh plan; "anchor lost" means the chapter
  // it pointed at is gone. We can only tell them apart by whether the node ever HAD an anchor, which
  // the row does not record — so we state what we know (no anchor) and offer the fix (⚓ re-anchor),
  // rather than guessing which story to tell.
  const { t } = useTranslation('studio');
  const anchored = !!node.chapter_id;

  return (
    <div data-testid="plan-drawer-edit" className="space-y-2 border-b p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">{t('planPasses.edit')}</h3>

      <CommitField
        label={t('panels.scene-inspector.f.title')}
        testid="plan-drawer-edit-title"
        value={node.title ?? ''}
        disabled={saving}
        onCommit={(title) => onEdit({ title })}
      />

      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('panels.scene-inspector.f.status')}
        </div>
        <select
          data-testid="plan-drawer-edit-status"
          aria-label={t('panels.scene-inspector.f.status')}
          className="w-full rounded border bg-background px-1.5 py-1 text-xs disabled:opacity-50"
          value={node.status}
          disabled={saving}
          onChange={(e) => onEdit({ status: e.target.value })}
        >
          {NODE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`planHub.flow.status.${s}`)}
            </option>
          ))}
          {/* An unfamiliar status keeps its machine value with a localized label rather than
              silently snapping the select to the first option (which would then WRITE that value). */}
          {!NODE_STATUSES.includes(node.status as NodeStatusValue) && (
            <option value={node.status}>{t('planHub.drawer.unknown')}</option>
          )}
        </select>
      </div>

      {/* Tension commits on BLUR, like every other field. It used to write on every `onChange`, so
          typing "45" fired TWO PATCHes — and since the second carried the pre-write `version`, it
          412'd and blamed a phantom collaborator for your own keystroke. (The row's fresh version is
          now also seeded into the cache on success, which closes the same window for the selects.) */}
      <CommitField
        label={t('panels.scene-inspector.f.tension')}
        testid="plan-drawer-edit-tension"
        value={node.tension == null ? '' : String(node.tension)}
        disabled={saving}
        numeric
        onCommit={(raw) => {
          // Empty ⇒ explicitly NULL (unset), not 0. A 0-tension scene and an unset one are different
          // facts, and the sparkline reads them differently.
          const t = raw.trim();
          if (t === '') return onEdit({ tension: null });
          const n = Number(t);
          if (Number.isNaN(n)) return; // junk in a number box: ignore, don't write NaN
          onEdit({ tension: Math.max(0, Math.min(100, Math.round(n))) });
        }}
      />

      <CommitField
        label={t('panels.scene-inspector.f.goal')}
        testid="plan-drawer-edit-goal"
        value={node.goal ?? ''}
        multiline
        disabled={saving}
        onCommit={(goal) => onEdit({ goal })}
      />

      <CommitField
        label={t('panels.scene-inspector.f.synopsis')}
        testid="plan-drawer-edit-synopsis"
        value={node.synopsis ?? ''}
        multiline
        disabled={saving}
        onCommit={(synopsis) => onEdit({ synopsis })}
      />

      {/* ⚓ ANCHOR (BPS-13) — which manuscript chapter this spec node is bound to. */}
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('planHub.drawer.anchor')}
        </div>
        <select
          data-testid="plan-drawer-edit-anchor"
          aria-label={t('planHub.drawer.anchor')}
          className="w-full rounded border bg-background px-1.5 py-1 text-xs disabled:opacity-50"
          value={node.chapter_id ?? ''}
          disabled={saving || chaptersError}
          onChange={(e) => onEdit({ chapter_id: e.target.value || null })}
        >
          <option value="">{t('planHub.drawer.notAnchored')}</option>
          {/* The node's CURRENT anchor, even if the spine didn't come back / doesn't contain it.
              Without this the select would silently fall back to "— not anchored —" and misreport a
              perfectly-anchored node as un-anchored. */}
          {node.chapter_id && !chapters.some((c) => c.chapter_id === node.chapter_id) && (
            <option value={node.chapter_id}>{t('planHub.drawer.currentAnchor')}</option>
          )}
          {chapters.map((c) => (
            <option key={c.chapter_id} value={c.chapter_id}>
              {c.sort_order}. {c.title || t('planHub.node.untitled')}
            </option>
          ))}
        </select>
        {chaptersError && (
          <p data-testid="plan-drawer-anchor-error" className="mt-0.5 text-[11px] text-destructive">
            {t('planHub.drawer.anchorError')}
          </p>
        )}
        {!anchored && !chaptersError && (
          <p data-testid="plan-drawer-no-anchor" className="mt-0.5 text-[11px] text-amber-600">
            {t('planHub.drawer.noAnchor')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {/* PH16's fixed contract: the drawer edits the DESIRED state; THIS goes to the ACTUAL. */}
        <button
          type="button"
          data-testid="plan-drawer-open-editor"
          disabled={!anchored}
          title={anchored ? undefined : t('planHub.drawer.anchorFirst')}
          onClick={() => node.chapter_id && onOpenInEditor(node.chapter_id)}
          className="rounded border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-40"
        >
          {t('planHub.drawer.openEditor')}
        </button>

        {node.is_archived ? (
          <button
            type="button"
            data-testid="plan-drawer-restore"
            disabled={saving}
            onClick={onRestore}
            className="rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            {t('planner.list.restore')}
          </button>
        ) : (
          <button
            type="button"
            data-testid="plan-drawer-archive"
            disabled={saving}
            onClick={onArchive}
            className="rounded border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {t('planner.list.archive')}
          </button>
        )}
      </div>
    </div>
  );
}
