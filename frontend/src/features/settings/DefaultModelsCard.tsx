import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { AddModelCta } from '@/components/shared/AddModelCta';
import { ModelPicker } from '@/components/model-picker';
import { defaultModelsApi, RERANK_CAPABILITY, PLANNER_CAPABILITY, CHAT_CAPABILITY, COMPOSER_CAPABILITY, CRITIC_ROLE, DISTILL_ROLE } from './api';
import { chatApi } from '@/features/chat/api';

/**
 * #facade — default→dependent propagation. A chat session PINNS its model at
 * creation (model_source:'user_model'), so changing the account chat default
 * afterwards did NOT reflect in existing chats (incl. the studio co-author,
 * whose "Модель" binds to session.model_ref — the exact "default not applied"
 * report). After a successful chat-default save, every ACTIVE session still
 * pinned to the OLD default moves to the new one. Sessions deliberately set to
 * a different model are untouched (their model_ref differs).
 */
async function propagateChatDefault(
  token: string,
  oldDefault: string | null,
  newDefault: string,
): Promise<number> {
  if (!oldDefault || oldDefault === newDefault) return 0;
  const moved: string[] = [];
  let cursor: string | null = null;
  // Cursor-follow all active sessions (50/page server-side).
  for (;;) {
    const page = await chatApi.listSessions(token, 'active', undefined, cursor);
    for (const s of page.items) {
      if (s.model_ref === oldDefault && !moved.includes(s.session_id)) {
        await chatApi.patchSession(token, s.session_id, {
          model_source: 'user_model',
          model_ref: newDefault,
        });
        moved.push(s.session_id);
      }
    }
    cursor = page.next_cursor;
    if (!cursor) break;
  }
  return moved.length;
}

/**
 * Per-user DEFAULT model per capability (rerank/embedding). Restores the
 * default-model UX the removed RERANK_URL/_MODEL .env config gave — the BYOK way:
 * the default is one of the user's own registered models, resolved server-side by
 * provider-registry. Raw search (knowledge + the upcoming glossary search) falls
 * back to it when no per-scope model is set.
 */

interface RowProps {
  capability: string;
  /** Capability used to LIST candidate models — defaults to `capability`. Differs only
   *  for `planner`, a role with no model flag: it lists chat models but saves under
   *  `planner`. */
  listCapability?: string;
  label: string;
  hint: string;
  value: string | null;
  onChange: (userModelId: string | null) => void;
  disabled?: boolean;
}

function DefaultModelRow({ capability, listCapability, label, hint, value, onChange, disabled }: RowProps) {
  const { t } = useTranslation('settings');
  const fetchCapability = listCapability ?? capability;

  // W5: renders the shared ModelPicker (search / favorites / recents / orphan
  // handling built in); this wrapper keeps the row's label + hint + empty-state.
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      <ModelPicker
        capability={fetchCapability}
        value={value}
        onChange={onChange}
        allowNone
        noneLabel={t('defaultModels.none', { defaultValue: 'None' })}
        ariaLabel={label}
        disabled={disabled}
        emptyState={
          <span className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            {t('defaultModels.empty', { defaultValue: 'No capable models configured.' })}
            <AddModelCta capability={fetchCapability} variant="link" />
          </span>
        }
      />
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}

export function DefaultModelsCard() {
  const { t } = useTranslation('settings');
  const { accessToken } = useAuth();
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    defaultModelsApi
      .get(accessToken)
      .then((r) => {
        if (!cancelled) setDefaults(r.defaults || {});
      })
      .catch(() => {
        /* best-effort load; an empty card still works */
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const save = async (capability: string, userModelId: string | null) => {
    if (!accessToken) return;
    const prev = defaults;
    const oldDefault = prev[capability] ?? null;
    // Optimistic update.
    setDefaults((d) => {
      const next = { ...d };
      if (userModelId) next[capability] = userModelId;
      else delete next[capability];
      return next;
    });
    setSaving(true);
    try {
      await defaultModelsApi.set(accessToken, capability, userModelId);
      toast.success(t('defaultModels.saved', { defaultValue: 'Default updated' }));
      // #facade — default→dependent propagation for the CHAT role: sessions
      // still pinned to the old default follow the new one (deliberately-set
      // sessions differ and are untouched). Fire-and-forget: the default is
      // already saved; propagation failures surface as their own toast.
      if (capability === CHAT_CAPABILITY) {
        void propagateChatDefault(accessToken, oldDefault, userModelId ?? '')
          .then((n) => {
            if (n > 0) {
              toast.success(
                t('defaultModels.propagated', {
                  defaultValue: '{{n}} existing chat(s) moved to the new default',
                  n,
                }),
              );
            }
          })
          .catch(() => {
            toast.error(
              t('defaultModels.propagate_failed', {
                defaultValue: 'Existing chats were NOT moved to the new default — re-pin them manually.',
              }),
            );
          });
      }
    } catch (e) {
      setDefaults(prev); // rollback
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">
          {t('defaultModels.heading', { defaultValue: 'Default models' })}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('defaultModels.subtitle', {
            defaultValue: 'Your per-user fallback models (BYOK — your own). Used when no per-scope model is set.',
          })}
        </p>
      </div>
      <div className="max-w-sm">
        {/* Chat default (W5): preselected by the New Chat dialog. */}
        <div className="mb-4">
          <DefaultModelRow
            capability={CHAT_CAPABILITY}
            label={t('defaultModels.chat', { defaultValue: 'Default chat model' })}
            hint={t('defaultModels.chatHint', {
              defaultValue: 'Preselected when you start a new chat. Leave empty to default to your favorites.',
            })}
            value={defaults[CHAT_CAPABILITY] ?? null}
            onChange={(id) => void save(CHAT_CAPABILITY, id)}
            disabled={saving}
          />
        </div>
        {/* Embedding default is intentionally NOT exposed yet: a query-time embedding
            default would break retrieval (it must match the model the project was
            indexed with), and the index-time consumer is a separate follow-up. The
            BE storage/routes stay generic (rerank+embedding) and ready. */}
        <DefaultModelRow
          capability={RERANK_CAPABILITY}
          label={t('defaultModels.rerank', { defaultValue: 'Default reranker' })}
          hint={t('defaultModels.rerankHint', {
            defaultValue: 'Cross-encoder rerank for raw-search junk-rejection. Optional — applies when a project has no rerank model set.',
          })}
          value={defaults[RERANK_CAPABILITY] ?? null}
          onChange={(id) => void save(RERANK_CAPABILITY, id)}
          disabled={saving}
        />
        {/* Planner default (D-PLAN-PLANNER-DEFAULT-FE): the model the glossary AI plans
            with. Lists chat models (planner is a role, not a model flag); pin a STRONG
            one so the planner isn't stuck on an arbitrary/weak fallback. */}
        <div className="mt-4">
          <DefaultModelRow
            capability={PLANNER_CAPABILITY}
            listCapability={CHAT_CAPABILITY}
            label={t('defaultModels.planner', { defaultValue: 'Default planner' })}
            hint={t('defaultModels.plannerHint', {
              defaultValue: 'The chat model the glossary assistant uses to build multi-step plans. Pick a strong, tool-capable model — otherwise planning falls back to an arbitrary chat model and often fails.',
            })}
            value={defaults[PLANNER_CAPABILITY] ?? null}
            onChange={(id) => void save(PLANNER_CAPABILITY, id)}
            disabled={saving}
          />
        </div>
        {/* Composer default (DQ-T89 (b), owner ruling 2026-09-02): the model that WRITES PROSE.
            Same shape as planner — a role, so it lists chat models and saves under 'composer'.
            Without it, composition_generate had only the per-BOOK setting to fall back on, and
            0 of 664 books carried one: the tool refused on ~98% of them and the turn wrote
            prose through a plain draft-save instead. */}
        <div className="mt-4">
          <DefaultModelRow
            capability={COMPOSER_CAPABILITY}
            listCapability={CHAT_CAPABILITY}
            label={t('defaultModels.composer', { defaultValue: 'Default composer' })}
            hint={t('defaultModels.composerHint', {
              defaultValue: 'The model that writes your prose when a book has no model of its own. Set deliberately — generation is the most expensive thing here, and nothing will spend through your chat model on your behalf.',
            })}
            value={defaults[COMPOSER_CAPABILITY] ?? null}
            onChange={(id) => void save(COMPOSER_CAPABILITY, id)}
            disabled={saving}
          />
        </div>
        {/* Critic default (#270): the model that SCORES coaching/interview sessions.
            Same chat-flag role family as planner/composer. evaluate.py Gate 2 falls
            an unset critic back to the account CHAT default and refuses (409) only
            when no distinct judge resolves — the row the instruction names must exist.
            Pick a model that differs from the session actor (a roleplay partner
            grading its own performance is not a verdict). */}
        <div className="mt-4">
          <DefaultModelRow
            capability={CRITIC_ROLE}
            listCapability={CHAT_CAPABILITY}
            label={t('defaultModels.critic', { defaultValue: 'Default critic model' })}
            hint={t('defaultModels.criticHint', {
              defaultValue: 'Scores practice sessions and audits generated scenes. Optional — unset, your chat model judges instead (when it differs from the session\'s model); if no distinct judge resolves, scoring is refused.',
            })}
            value={defaults[CRITIC_ROLE] ?? null}
            onChange={(id) => void save(CRITIC_ROLE, id)}
            disabled={saving}
          />
        </div>
        {/* Distill default (#270): the headless "end my day" journal DISTILLER. Same
            chat-flag role family. Without a row this silently fell back to the chat
            default — a reasoning model emits only reasoning_content, which distills
            to an empty diary. */}
        <div className="mt-4">
          <DefaultModelRow
            capability={DISTILL_ROLE}
            listCapability={CHAT_CAPABILITY}
            label={t('defaultModels.distill', { defaultValue: 'Default distiller model' })}
            hint={t('defaultModels.distillHint', {
              defaultValue: 'Turns "end my day" chats into the daily diary. Optional — unset, it uses your chat default. Pick a NON-reasoning model: a reasoning model emits only reasoning and distills to an empty diary.',
            })}
            value={defaults[DISTILL_ROLE] ?? null}
            onChange={(id) => void save(DISTILL_ROLE, id)}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}
