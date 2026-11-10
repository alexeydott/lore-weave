// Studio Quality tab — QualityCriticPanel: resolves the book's composition Work, offers a
// chapter picker (booksApi.listChapters) + model picker, and renders QualityReportSection
// (DOCK-2 reuse) only once BOTH a project resolved AND a chapter is picked (no book-wide
// critic aggregation exists — see the plan doc's reality map).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IDockviewPanelProps } from 'dockview-react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import studioRu from '@/i18n/locales/ru/studio.json';
import compositionRu from '@/i18n/locales/ru/composition.json';
vi.unmock('react-i18next');
const ru = createInstance();
await ru.use(initReactI18next).init({ lng: 'ru', fallbackLng: false, resources: { ru: { studio: studioRu, composition: compositionRu } }, interpolation: { escapeValue: false } });
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
      <I18nextProvider i18n={ru}><StudioHostProvider bookId={bookId}><QualityCriticPanel {...dockProps()} /></StudioHostProvider></I18nextProvider>
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

describe('Russian durable Quality critic UI', () => {
  it('renders confirmed server scores and translated controls without local storage', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    withHost('b1');
    expect(screen.getByText(studioRu.quality.criticBatchTitle)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('quality-critic-batch')).toBeEnabled());
    fireEvent.click(screen.getByTestId('quality-critic-batch'));
    fireEvent.click(await screen.findByTestId('quality-critic-batch-confirm'));
    const entry = await screen.findByTestId('quality-critic-batch-entry-ch1');
    for (const dimension of ['coherence', 'voice_match', 'pacing', 'canon_consistency'] as const) expect(entry).toHaveTextContent(compositionRu[dimension]);
    expect(localStorage.length).toBe(0);
  });
  for (const reason of ['context_limit', 'network', 'unavailable', 'reasoning_exhausted', 'truncated', 'invalid_response'] as const) {
    it(`restores server scope and Russian ${reason} without automatic retry`, async () => {
      useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
      listRuns.mockResolvedValue({ runs: [serverRun({ scope: { partial: true, chapter_partial: true, windows_analyzed: 1, windows_total: 7 }, critic: { ...report.critic, error: `critic_${reason}` } } as unknown as typeof report, `critic_${reason}`)] });
      withHost('b1');
      expect(await screen.findByTestId('quality-reason')).toHaveTextContent(compositionRu.qualityReasons[reason]);
      expect(screen.getByTestId('quality-reason')).toHaveTextContent(compositionRu.qualityReasons.manualRetry);
      expect(screen.getByTestId('quality-partial')).toHaveTextContent(ru.t('qualityScope.chapter', { ns: 'composition', analyzed: 1, total: 7 }));
      expect(startRun).not.toHaveBeenCalled();
      expect(qualityReport).not.toHaveBeenCalled();
      expect(localStorage.length).toBe(0);
    });
  }
  it('renders chapter loading failures in Russian', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    listChaptersPage.mockRejectedValue(new Error('offline'));
    withHost('b1');
    expect(await screen.findByText(studioRu.quality.chaptersLoadError)).toBeInTheDocument();
  });
});
