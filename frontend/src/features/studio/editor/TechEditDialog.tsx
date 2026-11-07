// Техправка dialog (#user-report 2026-11-07) — deterministic cleanup presets +
// custom find→replace + an open-ended AI task. The DETERMINISTIC path applies
// mark-preserving ProseMirror transactions through the handle (runTechTransforms
// + collapseBlankParagraphs); the AI path streams the edited chapter through the
// selection-edit SSE (operation 'rewrite', the user's task as the guide) and
// applies the result through EditorPanel's checkpointed whole-doc seam — every
// apply captures a pre-edit checkpoint, so the existing Restore panel undoes it.
//
// The dialog NEVER auto-applies: Preview (per-preset hit counts / streamed
// result) → explicit «Применить».
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useCompositionStream } from '../../composition/hooks/useCompositionStream';
import { dryRunTechEdits, TECH_PRESETS, type TechEditPresetId } from './techEdits';

export interface TechEditDialogProps {
  onClose: () => void;
  /** Runs the deterministic presets + custom find/replace inside the editor's
   *  transaction (mark-preserving). Returns node-level replacements made. */
  onRunDeterministic: (opts: { presets: string[]; find?: string; replace?: string }) => number;
  /** Applies a whole-document replacement through the checkpointed seam
   *  (select-all + checkpoint capture + replace). Returns false when the
   *  editor/chapter isn't live. */
  onApplyWholeDoc: (text: string, label: string) => boolean;
  /** The chapter's current plain text (preview source). */
  getText: () => string;
  projectId: string | null;
  token: string | null;
  /** Resolved compose model (Work ▸ session ▸ sole chat) for the AI task. */
  modelRef: string | null;
  modelName?: string;
}

type Mode = 'presets' | 'ai';

export function TechEditDialog({
  onClose,
  onRunDeterministic,
  onApplyWholeDoc,
  getText,
  projectId,
  token,
  modelRef,
  modelName,
}: TechEditDialogProps) {
  const { t } = useTranslation('composition');
  const [mode, setMode] = useState<Mode>('presets');
  const [selected, setSelected] = useState<Set<TechEditPresetId>>(new Set());
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [task, setTask] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const stream = useCompositionStream(token);

  const text = getText();
  const preview = useMemo(
    () => dryRunTechEdits(text, selected, find || undefined, replace || undefined),
    [text, selected, find, replace],
  );

  const togglePreset = (id: TechEditPresetId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyPresets = () => {
    if (selected.size === 0 && !find) return;
    const n = onRunDeterministic({ presets: [...selected], find: find || undefined, replace: replace || undefined });
    setSummary(
      n > 0
        ? t('techEdit.applied', { defaultValue: 'Applied: {{n}} replacement(s)', n })
        : t('techEdit.nothing', { defaultValue: 'Nothing to fix — the text is already clean.' }),
    );
  };

  const runAi = () => {
    if (!task.trim() || !projectId || !modelRef) return;
    setSummary(null);
    void stream.start({
      projectId,
      selection: text,
      operation: 'rewrite',
      sceneContext: null,
      modelSource: 'user_model',
      modelRef,
      guide: t('techEdit.guide_prefix', {
        defaultValue:
          'Техническая правка текста. Выполни ТОЛЬКО эту задачу, не переписывай прозу по своему усмотрению и сохрани объём и структуру абзацев, если задача не требует иного:',
      }) + ' ' + task.trim(),
      modelName,
    });
  };

  const aiResult = stream.ghost;

  const applyAi = () => {
    if (!aiResult.trim()) return;
    if (onApplyWholeDoc(aiResult, task.trim() || 'AI technical edit')) onClose();
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

        <div className="mb-3 flex items-center gap-2 text-[11px]">
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

        {mode === 'presets' ? (
          <>
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
                ? t('techEdit.preview_hits', { defaultValue: 'Будет замен: {{n}}', n: preview.totalHits })
                : t('techEdit.preview_clean', { defaultValue: 'Изменений не найдено.' })}
            </p>
            <button
              type="button"
              data-testid="techedit-apply-presets"
              disabled={preview.totalHits === 0}
              onClick={applyPresets}
              className="mb-2 w-full rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {t('techEdit.apply_presets', { defaultValue: 'Применить чистку' })}
            </button>
            {summary && <p className="mb-2 text-[11px] text-emerald-500">{summary}</p>}
            <p className="text-[10px] text-muted-foreground">
              {t('techEdit.backup_note', {
                defaultValue: 'Точка восстановления создаётся перед применением — «Отменить» в панели ревизий вернёт текст.',
              })}
            </p>
          </>
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
            <button
              type="button"
              data-testid="techedit-run-ai"
              disabled={!task.trim() || !modelRef || !projectId || stream.streaming}
              onClick={runAi}
              className="mb-2 w-full rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {stream.streaming
                ? t('techEdit.running', { defaultValue: 'ИИ работает…' })
                : t('techEdit.run_ai', { defaultValue: 'Выполнить правку с помощью ИИ' })}
            </button>
            {stream.error && <p className="mb-2 text-[11px] text-destructive">{stream.error}</p>}
            {aiResult.trim() && !stream.streaming && (
              <>
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {t('techEdit.ai_result', {
                    defaultValue: 'ИИ подготовил новый текст главы ({{n}} симв.). Проверьте и примените — точка восстановления создаётся автоматически.',
                    n: aiResult.length,
                  })}
                </p>
                <button
                  type="button"
                  data-testid="techedit-apply-ai"
                  onClick={() => onApplyWholeDoc(aiResult, task.trim() || 'AI technical edit') && onClose()}
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
