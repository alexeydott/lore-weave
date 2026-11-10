// Studio Quality tab — QualityCriticPanel: resolves the book's composition Work, offers a
// chapter picker (booksApi.listChapters) + model picker, and renders QualityReportSection
// (DOCK-2 reuse) only once BOTH a project resolved AND a chapter is picked (no book-wide
// critic aggregation exists — see the plan doc's reality map).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
}));
// useQualityWork also reads the active-Work pref (9262ed53e) — a real useQuery; stub it.
vi.mock('@/features/composition/hooks/useActiveWork', () => ({
  useActiveWorkId: () => ({ data: undefined }),
}));

const listChapters = vi.fn();
const listChaptersPage = vi.fn();
vi.mock('@/features/books/api', () => ({
  booksApi: {
    listChapters: (...args: unknown[]) => listChapters(...args),
    listChaptersPage: (...args: unknown[]) => listChaptersPage(...args),
  },
  chapterDisplayTitle: (chapter: { title?: string | null; sort_order: number }) => chapter.title || `Chapter ${chapter.sort_order}`,
}));

const qualityReport = vi.fn();
const listRuns = vi.fn();
const estimateRun = vi.fn();
const startRun = vi.fn();
const stopRun = vi.fn();
const report = { scope: { partial: false, complete: true, synthesis_completed: true }, critic: { coherence: 4, voice_match: 3, pacing: 2, canon_consistency: 5, violations: [] } };
function serverRun(result = report, error: string | null = null) { return { id: 'r', project_id: 'proj-1', book_id: 'b1', model_source: 'user_model', model_ref: 'model-1', status: 'completed', stop_requested: false, total: 1, completed: error ? 0 : 1, failed: error ? 1 : 0, chapters: [{ chapter_id: 'ch1', title: 'Chapter One', status: error ? 'failed' : 'completed', result: { report: result }, error }] }; }
vi.mock('@/features/composition/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/composition/api')>(),
  compositionApi: { qualityReport: (...args: unknown[]) => qualityReport(...args), listQualityRuns: (...args: unknown[]) => listRuns(...args), estimateQualityRun: (...args: unknown[]) => estimateRun(...args), startQualityRun: (...args: unknown[]) => startRun(...args), stopQualityRun: (...args: unknown[]) => stopRun(...args) },
}));

const effectiveModel = vi.fn(() => null);
vi.mock('@/features/chat-ai-settings/context/ChatAiSettingsContext', () => ({
  useEffectiveModelSelection: () => effectiveModel(),
}));

vi.mock('@/features/composition/components/QualityReportSection', () => ({
  QualityReportSection: ({ projectId, chapterId, modelRef }: { projectId: string; chapterId: string; modelRef: string }) => (
    <div data-testid="stub-quality-report" data-project={projectId} data-chapter={chapterId} data-model={modelRef} />
  ),
}));

vi.mock('@/components/model-picker', () => ({
  ModelPicker: ({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) => (
    <button data-testid="stub-model-picker" data-value={value ?? ''} onClick={() => onChange('model-1')}>pick</button>
  ),
  useUserModels: () => ({ models: [{ user_model_id: 'model-1', alias: 'm1', provider_model_name: 'm1' }] }),
}));

import { QualityCriticPanel } from '../QualityCriticPanel';

function dockProps() {
  return { api: { setTitle: vi.fn() } } as unknown as IDockviewPanelProps;
}

function withHost(bookId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StudioHostProvider bookId={bookId}><QualityCriticPanel {...dockProps()} /></StudioHostProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useWorkResolution.mockReset();
  listChapters.mockReset();
  listChaptersPage.mockReset();
  qualityReport.mockReset();
  listRuns.mockReset().mockResolvedValue({ runs: [] });
  estimateRun.mockReset().mockResolvedValue({ total: 1, estimated_calls_max: 8, estimated_usd_max: 0.5, chapters: [] });
  startRun.mockReset().mockResolvedValue(serverRun());
  stopRun.mockReset();
  effectiveModel.mockReset().mockReturnValue(null);
  const chapters = [
    { chapter_id: 'ch1', title: 'Chapter One', original_filename: 'ch1.txt', sort_order: 1, draft_updated_at: '2026-11-08T00:00:00Z', draft_revision_count: 1 },
  ];
  listChapters.mockResolvedValue({ items: chapters, total: 1 });
  listChaptersPage.mockResolvedValue({ items: chapters, total: 1, next_cursor: null });
});

describe('QualityCriticPanel', () => {
  it('shows a loading state while the Work is resolving', () => {
    useWorkResolution.mockReturnValue({ isLoading: true, data: undefined });
    withHost('b1');
    expect(screen.getByTestId('quality-critic-loading')).toBeInTheDocument();
  });

  it('shows a no-work empty state when the book has no composition Work', () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'none', work: null } });
    withHost('b1');
    expect(screen.getByTestId('quality-critic-no-work')).toBeInTheDocument();
  });

  it('shows a pick-a-chapter hint before any chapter is selected, never rendering the report', () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    withHost('b1');
    expect(screen.getByTestId('quality-critic-no-chapter')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-quality-report')).toBeNull();
  });

  it('renders the quality report once a chapter + model are picked, scoped to the resolved project', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    withHost('b1');

    await waitFor(() => expect(screen.getByRole('option', { name: 'Chapter One' })).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('quality-critic-chapter-picker'), { target: { value: 'ch1' } });
    fireEvent.click(screen.getByTestId('stub-model-picker'));

    const stub = screen.getByTestId('stub-quality-report');
    expect(stub).toHaveAttribute('data-project', 'proj-1');
    expect(stub).toHaveAttribute('data-chapter', 'ch1');
    expect(stub).toHaveAttribute('data-model', 'model-1');
  });

  it('loads every picker chapter through cursor pages', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    listChaptersPage
      .mockResolvedValueOnce({
        items: [{ chapter_id: 'ch1', title: 'Chapter One', sort_order: 1 }], total: 101, next_cursor: 'next',
      })
      .mockResolvedValueOnce({
        items: [{ chapter_id: 'ch101', title: 'Chapter 101', sort_order: 101 }], total: null, next_cursor: null,
      });
    withHost('b1');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Chapter 101' })).toBeInTheDocument());
    expect(listChaptersPage).toHaveBeenCalledTimes(2);
  });

  it('estimates inherited platform models and submits only after explicit confirmation without local reports', async () => {
    effectiveModel.mockReturnValue({ model_source: 'platform_model', model_ref: 'provider/ref' });
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    withHost('b1');
    await waitFor(() => expect(screen.getByTestId('quality-critic-batch')).toBeEnabled());
    expect(startRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('quality-critic-batch'));
    await screen.findByTestId('quality-critic-batch-confirm');
    expect(estimateRun).toHaveBeenCalledWith('proj-1', { model_source: 'platform_model', model_ref: 'provider/ref' }, 'tok');
    expect(startRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('quality-critic-batch-confirm'));
    await screen.findByTestId('quality-critic-batch-entry-ch1');
    expect(startRun).toHaveBeenCalledWith('proj-1', expect.objectContaining({ model_source: 'platform_model', model_ref: 'provider/ref', max_estimated_calls: 8, max_estimated_usd: 0.5 }), 'tok');
    expect(qualityReport).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('restores failed server reports without automatic retry or claiming provider outage', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    listRuns.mockResolvedValue({ runs: [serverRun(report, 'critic_synthesis_invalid_response')] });
    withHost('b1');
    expect(await screen.findByTestId('quality-reason')).toHaveTextContent('qualityReasons.synthesis_invalid_response');
    expect(startRun).not.toHaveBeenCalled();
    expect(qualityReport).not.toHaveBeenCalled();
  });

  it('requests server stop-after-current without cancelling or resubmitting', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    const running = { ...serverRun(), status: 'running', completed: 0 };
    listRuns.mockResolvedValue({ runs: [running] });
    stopRun.mockResolvedValue({ ...running, stop_requested: true });
    withHost('b1');
    fireEvent.click(await screen.findByTestId('quality-critic-batch-stop'));
    await waitFor(() => expect(screen.getByTestId('quality-critic-batch-stop')).toBeDisabled());
    expect(stopRun).toHaveBeenCalledWith('proj-1', 'r', 'tok');
    expect(startRun).not.toHaveBeenCalled();
  });

  it('fails closed when the estimate is unavailable', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    estimateRun.mockRejectedValue(new Error('pricing unavailable'));
    withHost('b1');
    await waitFor(() => expect(screen.getByTestId('quality-critic-batch')).toBeEnabled());
    fireEvent.click(screen.getByTestId('quality-critic-batch'));
    await screen.findByTestId('quality-critic-batch-error');
    expect(screen.queryByTestId('quality-critic-batch-confirm')).toBeNull();
    expect(startRun).not.toHaveBeenCalled();
  });

  // /review-impl (D-04 follow-up) — `unavailable` means composition-service is DOWN. Rendering the
  // no-work sentence there tells the user "start composing a chapter first" when the data may well
  // exist and we simply could not look. Unconsulted is not empty. RUN-STATE DR-27.
  it('composition-service UNAVAILABLE is an ERROR, never the no-work empty state', () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'unavailable', work: null } });
    withHost('b1');
    expect(screen.getByTestId('quality-critic-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('quality-critic-no-work')).toBeNull();
  });
});
