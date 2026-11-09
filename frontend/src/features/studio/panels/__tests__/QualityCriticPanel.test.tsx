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
vi.mock('@/features/composition/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/composition/api')>(),
  compositionApi: { qualityReport: (...args: unknown[]) => qualityReport(...args) },
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

  it('sends the full inherited model source for whole-book analysis and caches each chapter', async () => {
    effectiveModel.mockReturnValue({ model_source: 'platform_model', model_ref: 'provider/ref' });
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    const page1 = { chapter_id: 'ch1', title: 'Chapter One', sort_order: 1, draft_updated_at: '2026-11-08T00:00:00Z', draft_revision_count: 1 };
    const page2 = { chapter_id: 'ch2', title: 'Chapter Two', sort_order: 2, draft_updated_at: '2026-11-08T00:01:00Z', draft_revision_count: 1 };
    listChaptersPage.mockResolvedValueOnce({ items: [page1], total: 2, next_cursor: 'c2' })
      .mockResolvedValueOnce({ items: [page2], total: null, next_cursor: null });
    const cleanReport = { report: { scope: { partial: false, complete: true, synthesis_completed: true }, critic: {
      coherence: 4, voice_match: 4, pacing: 4, canon_consistency: 4, violations: [],
    } } };
    qualityReport.mockResolvedValue(cleanReport);
    withHost('b1');

    await waitFor(() => expect(screen.getByRole('option', { name: 'Chapter Two' })).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('quality-critic-batch'));

    await waitFor(() => expect(screen.getByTestId('quality-critic-batch-entry-ch2')).toBeInTheDocument());
    expect(qualityReport).toHaveBeenCalledTimes(2);
    expect(qualityReport).toHaveBeenNthCalledWith(1, 'proj-1', {
      chapterId: 'ch1', modelRef: 'provider/ref', modelSource: 'platform_model',
    }, 'tok');
    const key = 'lw_critic_batch:b1:proj-1:platform_model:provider/ref';
    expect(JSON.parse(localStorage.getItem(key) || '[]')).toHaveLength(2);
  });

  it('reports a degraded critic result as retryable and retries it on the next pass', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    const chapter = { chapter_id: 'ch1', title: 'Chapter One', sort_order: 1, draft_updated_at: '2026-11-08T00:00:00Z', draft_revision_count: 1 };
    listChaptersPage.mockResolvedValue({ items: [chapter], total: 1, next_cursor: null });
    qualityReport.mockResolvedValueOnce({ report: { scope: { partial: false, complete: true, synthesis_completed: true }, critic: {
      coherence: null, voice_match: null, pacing: null, canon_consistency: null,
      violations: [], error: 'critic_unavailable',
    } } }).mockResolvedValueOnce({ report: { scope: { partial: false, complete: true, synthesis_completed: true }, critic: {
      coherence: 4, voice_match: 4, pacing: 4, canon_consistency: 4, violations: [],
    } } });
    withHost('b1');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Chapter One' })).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('quality-critic-batch'));
    await waitFor(() => expect(screen.getByTestId('quality-critic-batch-entry-ch1')).toHaveTextContent('qualityReasons.unavailable'));
    fireEvent.click(screen.getByTestId('quality-critic-batch'));
    await waitFor(() => expect(screen.getByTestId('quality-critic-batch-entry-ch1')).toHaveTextContent('coherence: 4/5'));
    expect(qualityReport).toHaveBeenCalledTimes(2);
  });

  it('stops between chapter requests and resumes without repeating the completed chapter', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    const chapters = [
      { chapter_id: 'ch1', title: 'Chapter One', sort_order: 1, draft_updated_at: '2026-11-08T00:00:00Z', draft_revision_count: 1 },
      { chapter_id: 'ch2', title: 'Chapter Two', sort_order: 2, draft_updated_at: '2026-11-08T00:01:00Z', draft_revision_count: 1 },
    ];
    listChaptersPage.mockResolvedValue({ items: chapters, total: 2, next_cursor: null });
    let resolveFirst!: (value: unknown) => void;
    qualityReport.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ report: { scope: { partial: false, complete: true, synthesis_completed: true }, critic: {
        coherence: 4, voice_match: 4, pacing: 4, canon_consistency: 4, violations: [],
      } } });
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    withHost('b1');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Chapter Two' })).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('quality-critic-batch'));
    await waitFor(() => expect(qualityReport).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('quality-critic-batch-stop'));
    await act(async () => resolveFirst({ report: { scope: { partial: false, complete: true, synthesis_completed: true }, critic: {
      coherence: 4, voice_match: 4, pacing: 4, canon_consistency: 4, violations: [],
    } } }));
    await waitFor(() => expect(screen.getByTestId('quality-critic-batch-entry-ch1')).toBeInTheDocument());
    expect(qualityReport).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('quality-critic-batch'));
    await waitFor(() => expect(screen.getByTestId('quality-critic-batch-entry-ch2')).toBeInTheDocument());
    expect(qualityReport).toHaveBeenCalledTimes(2);
  });

  it('clears the active Work+model cache key', async () => {
    effectiveModel.mockReturnValue({ model_source: 'user_model', model_ref: 'model-1' });
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    const chapter = { chapter_id: 'ch1', title: 'Chapter One', sort_order: 1, draft_updated_at: '2026-11-08T00:00:00Z', draft_revision_count: 1 };
    listChaptersPage.mockResolvedValue({ items: [chapter], total: 1, next_cursor: null });
    qualityReport.mockResolvedValue({ report: { scope: { partial: false, complete: true, synthesis_completed: true }, critic: {
      coherence: 4, voice_match: 4, pacing: 4, canon_consistency: 4, violations: [],
    } } });
    withHost('b1');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Chapter One' })).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('quality-critic-batch'));
    await waitFor(() => expect(screen.getByTestId('quality-critic-batch-entry-ch1')).toBeInTheDocument());
    expect(localStorage.getItem('lw_critic_batch:b1:proj-1:user_model:model-1')).not.toBeNull();
    fireEvent.click(screen.getByTestId('quality-critic-batch-clear'));
    expect(localStorage.getItem('lw_critic_batch:b1:proj-1:user_model:model-1')).toBeNull();
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
