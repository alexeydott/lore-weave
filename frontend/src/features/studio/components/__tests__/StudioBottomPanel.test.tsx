import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

// The bottom panel shells two real feeds (JobsCompactFeed + StudioIssuesFeed); mock both
// so this stays a thin render/routing test. JobsCompactFeed receives the detail/full-panel
// callbacks and the resize contract is exercised on the sash element itself.
const openPanel = vi.hoisted(() => vi.fn());
vi.mock('../../host/StudioHostProvider', () => ({
  useStudioHost: () => ({ bookId: 'b1', openPanel }),
}));
vi.mock('@/auth', () => ({
  // the real JobsStreamProvider (kept live in this shell test) reads the token.
  useAuth: () => ({ accessToken: 'test-token' }),
}));
vi.mock('../StudioIssuesFeed', () => ({
  StudioIssuesFeed: () => <div data-testid="studio-issues-feed-stub" />,
}));
vi.mock('@/features/jobs/components/JobsCompactFeed', () => ({
  JobsCompactFeed: ({
    onOpenDetail,
    onOpenFullPanel,
  }: {
    onOpenDetail?: (s: string, id: string) => void;
    onOpenFullPanel?: () => void;
  }) => (
    <div data-testid="jobs-compact-feed-stub">
      <button data-testid="jobs-compact-row-stub" onClick={() => onOpenDetail?.('video-gen', 'job1')} />
      <button data-testid="jobs-compact-full-stub" onClick={() => onOpenFullPanel?.()} />
    </div>
  ),
}));

import { StudioBottomPanel } from '../StudioBottomPanel';

const HEIGHT = 200;

function renderPanel(onClose = vi.fn(), onResize = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StudioBottomPanel onClose={onClose} height={HEIGHT} onResize={onResize} />
    </QueryClientProvider>,
  );
}

describe('StudioBottomPanel', () => {
  it('defaults to Jobs with the compact feed; row click opens job-detail, header opens the full panel', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('jobs-compact-row-stub'));
    expect(openPanel).toHaveBeenCalledWith('job-detail', {
      params: { service: 'video-gen', jobId: 'job1' },
    });
    fireEvent.click(screen.getByTestId('jobs-compact-full-stub'));
    expect(openPanel).toHaveBeenCalledWith('jobs-list', { focus: true });
  });

  it('switches to the Issues tab and renders the real problems feed', () => {
    renderPanel();
    expect(screen.queryByTestId('studio-issues-feed-stub')).toBeNull();
    fireEvent.click(screen.getByText('bottom.issues'));
    expect(screen.getByTestId('studio-issues-feed-stub')).toBeInTheDocument();
  });

  it('has no Generation tab (the duplicate-stub atavism is gone)', () => {
    renderPanel();
    expect(screen.queryByText('bottom.generation')).toBeNull();
    expect(screen.queryByTestId('studio-bottom-open-jobs-jobs')).toBeNull();
  });

  it('fires onClose from the collapse control', () => {
    const onClose = vi.fn();
    renderPanel(onClose);
    fireEvent.click(screen.getByTitle('bottom.collapse'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the sash resizes live (persist=false) and persists on pointer-up (grow = drag up)', () => {
    const onResize = vi.fn();
    renderPanel(vi.fn(), onResize);
    const sash = screen.getByTestId('studio-bottom-resize');
    fireEvent.pointerDown(sash, { button: 0, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(sash, { clientY: 340 }); // 60px up → grow
    expect(onResize).toHaveBeenLastCalledWith(HEIGHT + 60, false);
    fireEvent.pointerUp(sash, { clientY: 320, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(HEIGHT + 80, true);
  });

  it('double-click on the sash resets to the default height', () => {
    const onResize = vi.fn();
    renderPanel(vi.fn(), onResize);
    fireEvent.doubleClick(screen.getByTestId('studio-bottom-resize'));
    expect(onResize).toHaveBeenCalledWith(200, true);
  });
});
