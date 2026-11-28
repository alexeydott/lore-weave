// Bottom panel (toggle) — the VS Code "panel" analogue: Jobs / Issues.
// S-10 O3: Issues is a real ranked problems feed (StudioIssuesFeed). Jobs embeds the
// real jobs feed inline — the SAME JobsStreamProvider/JobsList the jobs-list dock
// panel and the /jobs page render (DOCK-2, no fork). The old stub tabs (two identical
// pointer buttons to the same dock panel, one labelled "Generation" with no distinct
// content anywhere) were removed as atavism #user-report 2026-11-28: the bottom
// panel must hold CONTENT, not launchers.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JobsStreamProvider } from '@/features/jobs/context/JobsStreamProvider';
import { JobsList } from '@/features/jobs/components/JobsList';
import { useStudioHost } from '../host/StudioHostProvider';
import { StudioIssuesFeed } from './StudioIssuesFeed';

type BottomTab = 'jobs' | 'issues';
const TABS: BottomTab[] = ['jobs', 'issues'];

export function StudioBottomPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('studio');
  const { openPanel } = useStudioHost();
  const [tab, setTab] = useState<BottomTab>('jobs');

  return (
    <div data-testid="studio-bottom" className="flex h-[168px] flex-shrink-0 flex-col border-t bg-card">
      <div className="flex h-8 flex-shrink-0 items-stretch border-b">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              'relative px-3 text-xs font-medium transition-colors',
              tab === tb
                ? 'text-foreground after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`bottom.${tb}`, { defaultValue: tb })}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          title={t('bottom.collapse', { defaultValue: 'Collapse panel' })}
          className="flex w-8 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {tab === 'issues' ? (
          <StudioIssuesFeed />
        ) : (
          // Jobs — the real feed inline. Both the bottom panel and the jobs-list dock panel
          // mount JobsStreamProvider only while visible, so a second live stream exists only
          // when the user deliberately holds both open (same cost as /jobs → studio).
          <JobsStreamProvider>
            <div data-testid="studio-bottom-jobs-feed" className="min-h-0 flex-1 p-2">
              <JobsList
                onOpenDetail={(service, jobId) => openPanel('job-detail', { params: { service, jobId } })}
              />
            </div>
          </JobsStreamProvider>
        )}
      </div>
    </div>
  );
}
