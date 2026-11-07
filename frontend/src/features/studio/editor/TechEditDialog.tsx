// Техправка dialog (#user-report 2026-11-07) — deterministic cleanup presets +
// custom find→replace + an open-ended AI task. The DETERMINISTIC path applies
// mark-preserving ProseMirror transactions through the handle (runTechTransforms
// + collapseBlankParagraphs); the AI path streams the SCOPE text through the
// selection-edit SSE (operation 'rewrite', the user's task as the guide) and
// applies the result through EditorPanel's checkpointed seam — every apply
// captures a pre-edit checkpoint, so the existing Restore panel undoes it.
//
// SCOPE (#user-report 2026-11-07, «применить чистку не активируется»): a non-empty
// editor selection confines BOTH paths to the selected fragment; with no selection
// the whole chapter is the scope. The apply button enables as soon as the user
// picks presets / fills find — the preview is informational (it counts the
// structural blank-line estimate too), and the honest "nothing to fix" summary is
// reported AFTER an apply. The AI path chunks the scope text at paragraph
// boundaries under the endpoint's 8 000-char selection ceiling (whole-chapter
// selections used to 422 on that ceiling) and concatenates the streamed chunks.
//
// The dialog NEVER auto-applies: Preview (per-preset hit counts / streamed
// result) → explicit «Применить».
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { runCompositionGeneration } from '../../composition/hooks/runCompositionGeneration';
import { clampOutputBudget } from '@/lib/outputBudget';
import { diffSegments, dryRunTechEdits, splitScopeChunks, TECH_PRESETS, type TechEditPresetId, type TechEditPreviewItem, type TechEditPreviewResult } from './techEdits';

/** Fallback output budget per chunk when the resolved model carries no
 *  max_output_tokens: the endpoint default (1024) cannot re-emit an
 *  ~8 000-char chunk, so this is the minimum that can round-trip. */
const FALLBACK_CHUNK_OUTPUT_TOKENS = 8192;

export type TechEditScope = 'doc' | 'selection';

export interface TechEditDialogProps {
  onClose: () => void;
  /** Runs the deterministic presets + custom find/replace inside the editor's
   *  transaction (mark-preserving). Returns node-level replacements made. */
  onRunDeterministic: (opts: { presets: string[]; find?: string; replace?: string; scope: TechEditScope }) => number;
  /** Applies an AI result through the checkpointed seam: `selection` replaces
   *  the current selection, `doc` replaces the whole chapter. Returns false
   *  when the editor/chapter isn't live. */
  onApplyScoped: (text: string, label: string, scope: TechEditScope) => boolean;
  /** The chapter's current plain text (preview/stream source when no selection). */
  getText: () => string;
  /** The current selection's plain text ('' when there is no selection). */
  getSelectedText: () => string;
  /** Live-doc count for the blank-line preset (the flat preview text cannot
   *  represent empty paragraphs — textBetween hides them). Same walk the apply
   *  will run, so the preview number is exact. */
  countBlankParagraphs: (scope: TechEditScope) => number;
  /** Pre-apply diff preview («для параноиков»): what an apply WOULD change,
   *  collected from the live doc by the same walk the apply runs. Read-only. */
  onPreview: (opts: { presets: string[]; find?: string; replace?: string; scope: TechEditScope }) => TechEditPreviewResult;
  projectId: string | null;
  token: string | null;
  /** Resolved compose model (Work ▸ session ▸ sole chat) for the AI task. */
  modelRef: string | null;
  modelName?: string;
  /** The model's output budget (user_models.max_output_tokens, effective) —
   *  sent as max_output_tokens on every chunk instead of a hardcoded constant. */
  maxOutputTokens?: number | null;
}

type Mode = 'presets' | 'ai';

/** One row of the pre-apply diff: a struck/inserted span for text rewrites,
 *  a ¶ badge with neighbour context for blank-line deletions. */
function PreviewRow({ item }: { item: TechEditPreviewItem }) {
  const { t } = useTranslation('composition');
  if (item.kind === 'blank') {
    const ctx = (s: string, head: boolean) => {
      const clean = s.replace(/\s+/g, ' ').trim();
      if (!clean) return '—';
      return head
        ? clean.slice(0, 34) + (clean.length > 34 ? '…' : '')
        : (clean.length > 34 ? '…' : '') + clean.slice(-34);
    };
    return (
      <p className="text-[11px] leading-snug">
        <span className="mr-1.5 rounded bg-amber-500/15 px-1 py-px text-[10px] text-amber-500">¶</span>
        <span className="text-amber-500">{t('techEdit.preview_blank', { defaultValue: 'пустая строка будет удалена' })}</span>
        <span className="ml-1.5 text-muted-foreground/60">
          «{ctx(item.prevText, false)}» → «{ctx(item.nextText, true)}»
        </span>
      </p>
    );
  }
  const { pre, removed, added, post } = diffSegments(item.before, item.after);
  const capHead = (s: string) => (s.length > 32 ? '…' + s.slice(-32) : s);
  const capTail = (s: string) => (s.length > 32 ? s.slice(0, 32) + '…' : s);
  return (
    <p className="whitespace-pre-wrap break-all text-[11px] leading-snug">
      <span className="text-muted-foreground/60">{capHead(pre)}</span>
      {removed && (
        <span className="whitespace-pre rounded bg-red-500/15 px-0.5 text-red-400 line-through border-b border-red-400/50">{removed}</span>
      )}
      {added && <span className="whitespace-pre rounded bg-emerald-500/15 px-0.5 text-emerald-400">{added}</span>}
      <span className="text-muted-foreground/60">{capTail(post)}</span>
    </p>
  );
}

export function TechEditDialog({
  onClose,
  onRunDeterministic,
  onApplyScoped,
  onPreview,
  getText,
  getSelectedText,
  countBlankParagraphs,
  projectId,
  token,
  modelRef,
  modelName,
  maxOutputTokens,
}: TechEditDialogProps) {
  const { t } = useTranslation('composition');
  const [mode, setMode] = useState<Mode>('presets');
  const [selected, setSelected] = useState<Set<TechEditPresetId>>(new Set());
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [task, setTask] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  // The pre-apply diff step («для параноиков»): null = step 1 (pick work),
  // non-null = step 2 (review the collected changes → explicit confirm).
  const [pending, setPending] = useState<{ opts: { presets: string[]; find?: string; replace?: string }; result: TechEditPreviewResult } | null>(null);
  // AI-run state (direct runCompositionGeneration — the chunk loop owns accumulation;
  // useCompositionStream resets its ghost per start, which a multi-chunk run can't use).
  const [aiResult, setAiResult] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scopeText = getSelectedText();
  const scope: TechEditScope = scopeText ? 'selection' : 'doc';
  const text = scope === 'selection' ? scopeText : getText();
  const textPreview = useMemo(
    () => dryRunTechEdits(text, selected, find || undefined, replace || undefined),
    [text, selected, find, replace],
  );
  // The structural preset counts on the LIVE doc — flat text (textBetween)
  // hides empty paragraphs entirely, so a flat estimate would read 0 forever.
  const blankHits = selected.has('collapse_blank_paragraphs') ? countBlankParagraphs(scope) : 0;
  const preview = { totalHits: textPreview.totalHits + blankHits, perPreset: textPreview.perPreset };

  const togglePreset = (id: TechEditPresetId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyPresets = () => {
    if (!pending) return;
    const n = onRunDeterministic({ presets: [...pending.opts.presets], find: pending.opts.find, replace: pending.opts.replace, scope });
    setPending(null);
    setSummary(
      n > 0
        ? t('techEdit.applied', { defaultValue: 'Применено замен: {{n}}', n })
        : t('techEdit.nothing', { defaultValue: 'Исправлять нечего — текст уже чистый.' }),
    );
  };

  // Step 1 → step 2: collect the changes from the live doc (read-only) and show
  // them; a zero-hit collection stays on step 1 with the honest summary.
  const showPreview = () => {
    if (selected.size === 0 && !find.trim()) return;
    const opts = { presets: [...selected], find: find || undefined, replace: replace || undefined };
    const result = onPreview({ ...opts, scope });
    if (result.textTotal + result.blankTotal === 0) {
      setPending(null);
      setSummary(t('techEdit.nothing', { defaultValue: 'Исправлять нечего — текст уже чистый.' }));
      return;
    }
    setSummary(null);
    setPending({ opts, result });
  };

  const runAi = async () => {
    if (!task.trim() || !projectId || !modelRef || aiBusy) return;
    const guide = t('techEdit.guide_prefix', {
      defaultValue:
        'Техническая правка текста. Выполни ТОЛЬКО эту задачу, не переписывай прозу по своему усмотрению и сохрани объём и структуру абзацев, если задача не требует иного:',
    }) + ' ' + task.trim();
    const chunks = splitScopeChunks(text);
    // The model's own output budget (settings-derived), clamped to the
    // composition endpoints' accepted range; the fallback covers models
    // registered without a context_length (no derivation possible).
    const budget = clampOutputBudget(maxOutputTokens) ?? FALLBACK_CHUNK_OUTPUT_TOKENS;
    setAiError(null);
    setAiResult('');
    setSummary(null);
    setProgress({ done: 0, total: chunks.length });
    setAiBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    try {
      for (let i = 0; i < chunks.length; i++) {
        let piece = '';
        let failed: string | null = null;
        await runCompositionGeneration(
          {
            projectId,
            selection: chunks[i],
            operation: 'rewrite',
            sceneContext: null,
            modelSource: 'user_model',
            modelRef,
            guide,
            maxOutputTokens: budget,
            modelName,
          },
          token,
          {
            onToken: (delta) => {
              piece += delta;
              setAiResult(acc + piece);
            },
            onText: (full) => {
              piece = full;
              setAiResult(acc + piece);
            },
            onError: (msg) => {
              failed = msg;
            },
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (failed) {
          setAiError(failed);
          return;
        }
        if (!piece.trim()) {
          setAiError(t('techEdit.empty_chunk', { defaultValue: 'ИИ вернул пустой фрагмент — выполнение остановлено.' }));
          return;
        }
        // Chunk i ends with paragraph text (no trailing joiner) — restore the
        // \n\n boundary this split consumed.
        acc = acc ? acc + '\n\n' + piece : piece;
        setAiResult(acc);
        setProgress({ done: i + 1, total: chunks.length });
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setAiError(String((e as Error).message || e));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setAiBusy(false);
        setProgress(null);
      }
    }
  };

  const stopAi = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    // A partially streamed scope is NOT applyable — discard it rather than
    // offer a result that silently misses the un-streamed chunks.
    setAiBusy(false);
    setProgress(null);
    setAiResult('');
    setAiError(t('techEdit.stopped', { defaultValue: 'Выполнение остановлено.' }));
  };

  const applyAi = () => {
    if (!aiResult.trim()) return;
    if (onApplyScoped(aiResult, task.trim() || 'AI technical edit', scope)) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-xl border bg-card p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{t('techEdit.title', { defaultValue: 'Техническая правка' })}</h2>
          <button onClick={onClose} aria-label={t('techEdit.close', { defaultValue: 'Закрыть' })} className="rounded p-1 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="techedit-mode-presets"
              aria-pressed={mode === 'presets'}
              onClick={() => setMode('presets')}
              className={mode === 'presets' ? 'font-medium text-primary' : 'text-muted-foreground'}
            >
              {t('techEdit.mode_presets', { defaultValue: 'Чистка (мгновенно)' })}
            </button>
            <span className="text-muted-foreground/50">·</span>
            <button
              type="button"
              data-testid="techedit-mode-ai"
              aria-pressed={mode === 'ai'}
              onClick={() => setMode('ai')}
              className={mode === 'ai' ? 'font-medium text-primary' : 'text-muted-foreground'}
            >
              {t('techEdit.mode_ai', { defaultValue: 'Задача для ИИ' })}
            </button>
          </div>
          <span
            data-testid="techedit-scope"
            className={scope === 'selection' ? 'text-primary' : 'text-muted-foreground'}
          >
            {scope === 'selection'
              ? t('techEdit.scope_selection', { defaultValue: 'Выделение' })
              : t('techEdit.scope_doc', { defaultValue: 'Вся глава' })}
          </span>
        </div>

        {mode === 'presets' ? (
          pending ? (
            <>
              {/* Шаг 2 — предпросмотр изменений (для параноиков): что ИМЕННО
                  изменится, собрано из живого документа тем же обходом, каким
                  применится. Применение — только по явному подтверждению. */}
              <p className="mb-2 text-[11px] text-muted-foreground">
                {t('techEdit.preview_title', {
                  defaultValue: 'Замен: {{text}} · пустых строк удалится: {{blank}}',
                  text: pending.result.textTotal,
                  blank: pending.result.blankTotal,
                })}
              </p>
              <div data-testid="techedit-preview-list" className="mb-3 flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto rounded border bg-background/40 p-2">
                {pending.result.items.map((item, i) => (
                  <PreviewRow key={i} item={item} />
                ))}
                {pending.result.textTotal + pending.result.blankTotal > pending.result.items.length && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('techEdit.preview_more', {
                      defaultValue: '…и ещё {{n}}',
                      n: pending.result.textTotal + pending.result.blankTotal - pending.result.items.length,
                    })}
                  </p>
                )}
              </div>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  data-testid="techedit-apply-presets"
                  onClick={applyPresets}
                  className="flex-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  {t('techEdit.preview_apply', {
                    defaultValue: 'Применить ({{n}})',
                    n: pending.result.textTotal + pending.result.blankTotal,
                  })}
                </button>
                <button
                  type="button"
                  data-testid="techedit-preview-back"
                  onClick={() => setPending(null)}
                  className="rounded border px-3 py-1.5 text-xs"
                >
                  {t('techEdit.preview_back', { defaultValue: 'Назад' })}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t('techEdit.backup_note', {
                  defaultValue: 'Точка восстановления создаётся перед применением — «Отменить» в панели ревизий вернёт текст.',
                })}
              </p>
            </>
          ) : (
            <>
              {/* Шаг 1 — выбор работы; счётчик — живой (структурные пустые строки
                  считает документ, не плоский текст). */}
              <div className="mb-3 flex flex-col gap-1.5">
                {TECH_PRESETS.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => togglePreset(p.id)}
                      data-testid={`techedit-preset-${p.id}`}
                    />
                    {t(`techEdit.presets.${p.id}`, { defaultValue: p.fallback })}
                  </label>
                ))}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <input
                  data-testid="techedit-find"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder={t('techEdit.find_ph', { defaultValue: 'Найти…' })}
                  className="h-8 w-full rounded border bg-background px-2 text-xs"
                />
                <input
                  data-testid="techedit-replace"
                  value={replace}
                  onChange={(e) => setReplace(e.target.value)}
                  placeholder={t('techEdit.replace_ph', { defaultValue: 'Заменить на…' })}
                  className="h-8 w-full rounded border bg-background px-2 text-xs"
                />
              </div>
              <p className="mb-3 text-[11px] text-muted-foreground">
                {preview.totalHits > 0
                  ? t('techEdit.preview_hits', { defaultValue: 'Найдено изменений: {{n}}', n: preview.totalHits })
                  : t('techEdit.preview_clean', { defaultValue: 'Изменений не найдено.' })}
              </p>
              <button
                type="button"
                data-testid="techedit-preview-show"
                // Enabled as soon as the user picked ANY work to do; 0-hit
                // collections report the honest "nothing to fix" summary.
                disabled={selected.size === 0 && !find.trim()}
                onClick={showPreview}
                className="mb-2 w-full rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {t('techEdit.preview_show', { defaultValue: 'Показать изменения' })}
              </button>
              {summary && <p className="mb-2 text-[11px] text-emerald-500">{summary}</p>}
              <p className="text-[10px] text-muted-foreground">
                {t('techEdit.backup_note', {
                  defaultValue: 'Точка восстановления создаётся перед применением — «Отменить» в панели ревизий вернёт текст.',
                })}
              </p>
            </>
          )
        ) : (
          <>
            <textarea
              data-testid="techedit-task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={4}
              placeholder={t('techEdit.task_ph', {
                defaultValue: 'Опишите задачу для ИИ: например, «убери повторяющиеся слова», «замени все “кортеж” на “экипаж”»…',
              })}
              className="mb-2 w-full resize-y rounded border bg-background p-2 text-xs"
            />
            {!modelRef && (
              <p className="mb-2 text-[11px] text-amber-600">
                {t('techEdit.need_model', { defaultValue: 'Модель ИИ не выбрана — выберите её в чате соавтора.' })}
              </p>
            )}
            {modelName && (
              <p className="mb-2 text-[11px] text-muted-foreground">
                {t('techEdit.model_label', { defaultValue: 'Модель: {{name}}', name: modelName })}
              </p>
            )}
            {aiBusy ? (
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  data-testid="techedit-stop-ai"
                  onClick={stopAi}
                  className="flex-1 rounded border px-3 py-1.5 text-xs font-medium"
                >
                  {t('techEdit.stop', { defaultValue: 'Остановить' })}
                </button>
                {progress && (
                  <span className="text-[11px] text-muted-foreground">
                    {t('techEdit.progress', { defaultValue: 'Часть {{done}} из {{total}}', done: progress.done, total: progress.total })}
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                data-testid="techedit-run-ai"
                disabled={!task.trim() || !modelRef || !projectId}
                onClick={() => void runAi()}
                className="mb-2 w-full rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {t('techEdit.run_ai', { defaultValue: 'Выполнить правку с помощью ИИ' })}
              </button>
            )}
            {aiError && <p className="mb-2 text-[11px] text-destructive">{aiError}</p>}
            {aiResult.trim() && !aiBusy && (
              <>
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {t('techEdit.ai_result', {
                    defaultValue: 'ИИ подготовил новый текст ({{n}} симв.). Проверьте и примените — точка восстановления создаётся автоматически.',
                    n: aiResult.length,
                  })}
                </p>
                <button
                  type="button"
                  data-testid="techedit-apply-ai"
                  onClick={applyAi}
                  className="w-full rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  {t('techEdit.apply_ai', { defaultValue: 'Применить результат ИИ' })}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
