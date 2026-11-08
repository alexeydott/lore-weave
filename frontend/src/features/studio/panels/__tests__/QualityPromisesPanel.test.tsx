// Studio Quality tab — QualityPromisesPanel: resolves the book's composition Work via
// useWorkResolution, shows loading/no-work states, and renders the real ThreadsPanel
// (DOCK-2 reuse) once a project resolves. ThreadsPanel's own behavior is tested in its
// own file — this test stays about THIS panel's wiring.
//
// #user-report 2026-11-08 — the panel also owns the promise-tracking gate (the setup
// card flips `narrative_thread_enabled`) and the chapter backfill row; both mount
// react-query hooks, so every render is wrapped in a QueryClientProvider here, and
// `compositionApi.resolveWork` is mocked (the gate reads the resolved Work's settings).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IDockviewPanelProps } from 'dockview-react';
import { StudioHostProvider } from '../../host/StudioHostProvider';

vi.mock('@/auth', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));

const useWorkResolution = vi.fn();
vi.mock('@/features/composition/hooks/useWork', () => ({
  useWorkResolution: (bookId: string, token: string | null) => useWorkResolution(bookId, token),
  // D0 — the no-work branch now renders <WorkSetupCta>, which reuses these hooks.
  useCreateWork: () => ({ mutateAsync: vi.fn().mockResolvedValue({ project_id: 'proj-new' }), isPending: false }),
  usePendingWorkResolver: () => ({ state: 'idle', start: vi.fn(), retry: vi.fn() }),
  useSetWorkSettings: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }),
}));
// useQualityWork also reads the active-Work pref (9262ed53e) — a real useQuery; stub it.
vi.mock('@/features/composition/hooks/useActiveWork', () => ({
  useActiveWorkId: () => ({ data: undefined }),
}));

vi.mock('@/features/composition/api', () => ({
  compositionApi: {
    resolveWork: vi.fn().mockResolvedValue({
      status: 'found',
      work: { project_id: 'proj-1', settings: {} },
      candidates: [],
      book_project_id: null,
      book_project_ids: [],
    }),
    detectThreads: vi.fn().mockResolvedValue({ opened: 2, paid: 1, status: 'ok' }),
  },
}));

vi.mock('@/features/composition/components/ThreadsPanel', () => ({
  ThreadsPanel: ({ projectId, token, enabled }: { projectId: string; token: string | null; enabled: boolean }) => (
    <div data-testid="stub-threads-panel" data-project={projectId} data-token={token ?? ''} data-enabled={String(enabled)} />
  ),
}));

import { QualityPromisesPanel } from '../QualityPromisesPanel';

function dockProps() {
  return { api: { setTitle: vi.fn() } } as unknown as IDockviewPanelProps;
}

function withHost(bookId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StudioHostProvider bookId={bookId}><QualityPromisesPanel {...dockProps()} /></StudioHostProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => { useWorkResolution.mockReset(); });

describe('QualityPromisesPanel', () => {
  it('shows a loading state while the Work is resolving', () => {
    useWorkResolution.mockReturnValue({ isLoading: true, data: undefined });
    withHost('b1');
    expect(screen.getByTestId('quality-promises-loading')).toBeInTheDocument();
  });

  it('shows a no-work empty state when the book has no composition Work', () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'none', work: null } });
    withHost('b1');
    expect(screen.getByTestId('quality-promises-no-work')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-threads-panel')).toBeNull();
  });

  it('renders ThreadsPanel with the resolved project id and token, always enabled', () => {
    useWorkResolution.mockReturnValue({
      isLoading: false,
      data: { status: 'found', work: { project_id: 'proj-1' } },
    });
    withHost('b1');
    const stub = screen.getByTestId('stub-threads-panel');
    expect(stub).toHaveAttribute('data-project', 'proj-1');
    expect(stub).toHaveAttribute('data-token', 'tok');
    expect(stub).toHaveAttribute('data-enabled', 'true');
  });

  // /review-impl (D-04 follow-up) — `unavailable` means composition-service is DOWN. Rendering the
  // no-work sentence there tells the user "start composing a chapter first" when the data may well
  // exist and we simply could not look. Unconsulted is not empty. RUN-STATE DR-27.
  it('composition-service UNAVAILABLE is an ERROR, never the no-work empty state', () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'unavailable', work: null } });
    withHost('b1');
    expect(screen.getByTestId('quality-promises-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('quality-promises-no-work')).toBeNull();
    expect(screen.queryByTestId('stub-threads-panel')).toBeNull();
  });

  // #user-report 2026-11-08 — with tracking ON the panel renders the chapter backfill row.
  it('with tracking enabled, shows the chapter backfill row (chapter select + analyze)', async () => {
    const { compositionApi } = await import('@/features/composition/api');
    vi.mocked(compositionApi.resolveWork).mockResolvedValueOnce({
      status: 'found',
      work: { project_id: 'proj-1', settings: { narrative_thread_enabled: true, default_model_ref: 'model-1' } },
      candidates: [],
      book_project_id: null,
      book_project_ids: [],
    } as never);
    useWorkResolution.mockReturnValue({
      isLoading: false,
      data: { status: 'found', work: { project_id: 'proj-1', settings: { narrative_thread_enabled: true } } },
    });
    withHost('b1');
    await waitFor(() => expect(screen.getByTestId('quality-promises-analyze')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByTestId('quality-promises-chapter')).toBeInTheDocument();
  });
});
