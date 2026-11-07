import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { useAuth } from '@/auth';
import { defaultModelsApi, CHAT_CAPABILITY } from '@/features/settings/api';
import { useWorkResolution } from '../hooks/useWork';
import { useActiveWorkId } from '../hooks/useActiveWork';
import { resolveActiveWork } from '../workSelect';
import { useSetWorkSettings } from '../hooks/useWork';
import { patchForRole, roleRef } from '../modelRoles';

/**
 * #facade — the WORK-tier default model prompt (the third tier of the model cascade:
 * account default ▸ Work default ▸ session pick). The compose inline-AI layer and the
 * co-author "Продолжить с курсора" resolve their model from the WORK tier
 * (settings.model_roles.chat), and a Work whose settings predate the role map has NO
 * chat model — the tier falls back to nothing, so the panel shows
 * "Установите модель по умолчанию в настройках соавтора" forever, even though the
 * ACCOUNT tier has a chat default the user set deliberately.
 *
 * Per settings-and-config SET-1..8 this component does NOT silently copy the account
 * default onto the Work: it OFFERS the copy and applies it only on the user's
 * explicit click (that click is the consent). One offer per Work per session; the
 * user can pick a different model via the picker instead.
 */
export function WorkDefaultModelPrompt({ bookId }: { bookId: string }) {
  const { t } = useTranslation('composition');
  const { accessToken } = useAuth();
  const resolution = useWorkResolution(bookId, accessToken);
  const { data: activeWorkId } = useActiveWorkId(bookId, accessToken);
  const work = resolveActiveWork(resolution.data, activeWorkId);
  const { mutateAsync: setWorkSettings } = useSetWorkSettings(bookId, accessToken);

  const [accountDefault, setAccountDefault] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const settings = work?.settings ?? {};
  const workChatModel = roleRef(settings, CHAT_CAPABILITY);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    defaultModelsApi
      .get(accessToken)
      .then((r) => {
        if (!cancelled) setAccountDefault(r.defaults[CHAT_CAPABILITY] ?? null);
      })
      .catch(() => {
        /* best-effort: no account default → no offer */
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const project = work?.project_id ?? null;
  const offer =
    !!project &&
    !!accountDefault &&
    !workChatModel &&
    dismissedFor !== project &&
    resolution.data?.status === 'found';

  const apply = async () => {
    if (!project || !accountDefault) return;
    try {
      await setWorkSettings({
        projectId: project,
        currentSettings: settings as Record<string, unknown>,
        patch: patchForRole(settings as Record<string, unknown>, CHAT_CAPABILITY, accountDefault),
      });
      toast.success(
        t('compose.workDefault.applied', {
          defaultValue: 'Модель по умолчанию для этой книги установлена',
        }),
      );
    } catch (e) {
      toast.error((e as Error).message || t('compose.workDefault.apply_failed', { defaultValue: 'Не удалось применить' }));
    }
  };

  const dismiss = () => {
    if (project) setDismissedFor(project);
    else setDismissedFor('__none__');
  };

  if (!offer) return null;

  return (
    <div
      data-testid="work-default-model-prompt"
      role="status"
      className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-muted-foreground"
    >
      <span className="min-w-0 flex-1">
        {t('compose.workDefault.prompt', {
          defaultValue: 'Для этой книги не задана модель соавтора. Применить вашу чат-модель по умолчанию?',
        })}
      </span>
      <button
        type="button"
        data-testid="work-default-model-apply"
        onClick={() => void apply()}
        className="shrink-0 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20"
      >
        {t('compose.workDefault.apply', { defaultValue: 'Use my default chat model' })}
      </button>
      <button
        type="button"
        data-testid="work-default-model-dismiss"
        onClick={dismiss}
        className="shrink-0 rounded px-1 py-0.5 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
