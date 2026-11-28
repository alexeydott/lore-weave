import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The bottom panel embeds the real jobs feed (JobsStreamProvider/JobsList) and the real
// Issues feed; mock both so this stays a thin render/routing test.
const openPanel = vi.hoisted(() => vi.fn());
vi.mock('../../host/StudioHostProvider', () => ({
  useStudioHost: () => ({ bookId: 'b1', openPanel }),
}));
vi.mock('../StudioIssuesFeed', () => ({
  StudioIssuesFeed: () => <div data-testid="studio-issues-feed-stub" />,
}));
vi.mock('@/features/jobs/context/JobsStreamProvider', () => ({
  JobsStreamProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/jobs/components/JobsList', () => ({
  JobsList: ({ onOpenDetail }: { onOpenDetail?: (s: string, id: string) => void }) => (
    <button
      data-testid="studio-bottom-jobs-row"
      onClick={() => onOpenDetail?.('video-gen', 'job1')}
    />
  ),
}));

import { StudioBottomPanel } from '../StudioBottomPanel';

describe('StudioBottomPanel', () => {
  it('defaults to Jobs with the real feed inline; row clicks open job-detail in the dock', () => {
    render(<StudioBottomPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('studio-bottom-jobs-row'));
    expect(openPanel).toHaveBeenCalledWith('job-detail', {
      params: { service: 'video-gen', jobId: 'job1' },
    });
  });

  it('switches to the Issues tab and renders the real problems feed', () => {
    render(<StudioBottomPanel onClose={vi.fn()} />);
    expect(screen.queryByTestId('studio-issues-feed-stub')).toBeNull();
    fireEvent.click(screen.getByText('bottom.issues'));
    expect(screen.getByTestId('studio-issues-feed-stub')).toBeInTheDocument();
  });

  it('has no Generation tab (the duplicate-stub atavism is gone)', () => {
    render(<StudioBottomPanel onClose={vi.fn()} />);
    expect(screen.queryByText('bottom.generation')).toBeNull();
    expect(screen.queryByTestId('studio-bottom-open-jobs-jobs')).toBeNull();
  });

  it('fires onClose from the collapse control', () => {
    const onClose = vi.fn();
    render(<StudioBottomPanel onClose={onClose} />);
    fireEvent.click(screen.getByTitle('bottom.collapse'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
