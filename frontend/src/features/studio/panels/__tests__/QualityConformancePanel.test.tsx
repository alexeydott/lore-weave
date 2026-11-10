// Studio Quality tab — QualityConformancePanel: resolves the book's composition Work, offers a
// chapter picker (booksApi.listChapters) + model picker, and renders QualityReportSection
// (DOCK-2 reuse) only once BOTH a project resolved AND a chapter is picked (no book-wide
// critic aggregation exists — see the plan doc's reality map).
import { it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('@/features/composition/motif/components/ConformanceTraceView', () => ({ ConformanceTraceView: (p: {chapterId: string; modelSource: string}) => <div data-testid='trace' data-chapter={p.chapterId} data-source={p.modelSource} /> }));

vi.mock('@/components/model-picker', () => ({
  ModelPicker: ({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) => (
    <button data-testid="stub-model-picker" data-value={value ?? ''} onClick={() => onChange('model-1')}>pick</button>
  ),
  useUserModels: () => ({ models: [{ user_model_id: 'model-1', alias: 'm1', provider_model_name: 'm1' }] }),
}));

import { QualityConformancePanel } from '../QualityConformancePanel';

function dockProps() {
  return { api: { setTitle: vi.fn() } } as unknown as IDockviewPanelProps;
}

function withHost(bookId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StudioHostProvider bookId={bookId}><QualityConformancePanel {...dockProps()} /></StudioHostProvider>
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


it('loads every cursor page and forwards inherited platform source', async () => {
  useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'p' } } });
  effectiveModel.mockReturnValue({ model_source: 'platform_model', model_ref: 'platform' } as never);
  listChaptersPage.mockResolvedValueOnce({ items: [{ chapter_id: 'a', title: 'First' }], next_cursor: 'next' }).mockResolvedValueOnce({ items: [{ chapter_id: 'b', title: 'Last' }], next_cursor: null });
  withHost('book');
  await screen.findByText('Last');
  expect(listChaptersPage).toHaveBeenNthCalledWith(2, 'tok', 'book', { cursor: 'next', limit: 100, sort: 'sort_order' });
  fireEvent.change(screen.getByTestId('quality-conformance-chapter-picker'), { target: { value: 'b' } });
  expect(screen.getByTestId('trace')).toHaveAttribute('data-source', 'platform_model');
});
