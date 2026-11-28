import { useTranslation } from 'react-i18next';
import { useNotificationList } from '../hooks/useNotificationList';
import { categoryIcon } from '../constants';
import type { Notification } from '../api';

/**
 * The bottom-panel notifications feed — a compact projection of the SAME
 * feature layer the notifications dock panel renders (useNotificationList,
 * #11 W2 no-fork). Latest rows first, unread dot; a click marks read (the
 * api layer emits notifications:mutated, so every badge re-seeds) and hands
 * the notification to the studio wrapper for link resolution. The full
 * dashboard (categories, load-more, mark-all) stays one click away in the
 * notifications dock panel.
 */
export function NotificationsCompactFeed({
  onOpen,
  onOpenFullPanel,
}: {
  onOpen?: (n: Notification) => void;
  onOpenFullPanel?: () => void;
}) {
  const { t } = useTranslation('notifications');
  const { items, loading, unreadCount, markOne } = useNotificationList();

  const rows = items.slice(0, 8);

  return (
    <div data-testid="notifications-compact-feed" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span data-testid="notifications-compact-unread">
          {t('compact.unreadCount', { defaultValue: '{{n}} unread', n: unreadCount })}
        </span>
        <span className="flex-1" />
        {onOpenFullPanel && (
          <button
            type="button"
            data-testid="notifications-compact-full-panel"
            onClick={onOpenFullPanel}
            className="text-[11px] text-foreground/80 hover:text-foreground"
          >
            {t('compact.fullPanel', { defaultValue: 'Full panel →' })}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="notifications-compact-rows">
        {loading ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">{t('loading', { defaultValue: 'Loading…' })}</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">{t('empty', { defaultValue: 'No notifications yet.' })}</p>
        ) : (
          rows.map((n) => {
            const Icon = categoryIcon(n.category);
            return (
              <button
                key={n.id}
                type="button"
                data-testid="notifications-compact-row"
                onClick={() => {
                  if (!n.read) markOne(n.id);
                  onOpen?.(n);
                }}
                className="flex w-full items-center gap-2.5 border-b border-border/50 px-3 py-1.5 text-left text-xs hover:bg-accent/30"
              >
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${n.read ? 'text-muted-foreground/50' : 'text-primary'}`} />
                {!n.read && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" aria-hidden />}
                <span className={`min-w-0 flex-1 truncate ${n.read ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>
                  {n.title}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
