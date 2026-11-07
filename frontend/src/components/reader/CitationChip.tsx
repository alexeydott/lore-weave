import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCitationContext } from './CitationContext';

/**
 * wiki-llm M7a — the anti-hallucination trust chip. Renders a citation mark's
 * `[n]` as a focusable superscript chip; on hover/focus it opens a self-contained
 * popover (NO live fetch — it uses the `snippet` captured at generation time)
 * showing the cited source + relevance + a "jump to source" link into the
 * chapter reader at the exact block (raw-search precise-scroll, P3-A). The link
 * appears only when the book context + a chapter anchor are known; otherwise the
 * popover still surfaces the snippet so the claim is auditable.
 *
 * #user-report 2026-11-08 — the popover used to render INLINE inside the chip
 * wrap; `.content-block { position: relative }` on every reader block locked it
 * into that stacking context and the surrounding list text painted OVER it
 * («хинты отображаются ЗА текстом»). It now renders through a PORTAL into
 * document.body with fixed coordinates from the chip's rect — escaping every
 * ancestor stacking context — clamped to the viewport, flipped above the chip
 * when there is no room below.
 */
export interface CitationAttrs {
  n?: number | null;
  cite_id?: string | null;
  source_type?: string | null;
  chapter_id?: string | null;
  block_index?: number | null;
  score?: number | null;
  snippet?: string | null;
}

const POPOVER_WIDTH = 320;
const POPOVER_EST_HEIGHT = 150;

export function CitationChip({
  attrs,
  children,
}: {
  attrs: CitationAttrs;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation('reader');
  const { bookId } = useCitationContext();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const closeTimer = useRef<number | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) {
      let left = r.left;
      if (left + POPOVER_WIDTH > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - POPOVER_WIDTH - 8);
      }
      // Below the chip by default; flip above when the viewport runs out.
      const below = r.bottom + 6;
      const top = below + POPOVER_EST_HEIGHT > window.innerHeight - 8
        ? Math.max(8, r.top - POPOVER_EST_HEIGHT - 6)
        : below;
      setPos({ top, left });
    }
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }, []);

  const onBlur = useCallback((e: React.FocusEvent) => {
    // Focus leaving the wrap entirely hides — EXCEPT when it moved into the
    // portaled popover (the jump link): the popover is not a DOM descendant
    // of the wrap anymore, so the containment check needs the portal ref.
    const rel = e.relatedTarget as Node | null;
    if (rel && popoverRef.current?.contains(rel)) return;
    hide();
  }, [hide]);

  const n = attrs.n ?? '?';
  const sourceType = attrs.source_type || 'passage';
  const jumpTo =
    bookId && attrs.chapter_id
      ? `/books/${bookId}/chapters/${attrs.chapter_id}/read${
          attrs.block_index != null ? `?block=${attrs.block_index}` : ''
        }`
      : null;

  return (
    // Focus handling lives on the WRAP (React's onFocus/onBlur bubble) so the
    // popover stays open while focus is anywhere inside it — letting a keyboard
    // user tab from the chip INTO the jump link. onBlur only hides when focus
    // leaves the wrap entirely (relatedTarget check).
    <span
      ref={wrapRef}
      className="citation-chip-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={onBlur}
    >
      <button
        type="button"
        className="citation-chip"
        aria-label={t('citation.aria', { n })}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* the covered text — "[n]" in the body, "[n] label" in References — so
            the chip is correct in BOTH places (the body's separate superscript
            mark makes it a superscript chip; References stay full-size). */}
        {children}
      </button>
      {open && createPortal(
        <span
          ref={popoverRef}
          className="citation-popover"
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 80 }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <span className="citation-popover-head">
            <span className={`citation-source citation-source-${sourceType}`}>
              {t(`citation.source.${sourceType}`, { defaultValue: sourceType })}
            </span>
            {attrs.score != null && attrs.score >= 0 && attrs.score <= 1 && (
              <span className="citation-score" title={t('citation.relevance')}>
                {Math.round(attrs.score * 100)}%
              </span>
            )}
          </span>
          {attrs.snippet && <span className="citation-snippet">{attrs.snippet}</span>}
          {jumpTo && (
            <Link className="citation-jump" to={jumpTo} onClick={() => setOpen(false)}>
              {t('citation.jump')}
            </Link>
          )}
        </span>,
        document.body,
      )}
    </span>
  );
}
