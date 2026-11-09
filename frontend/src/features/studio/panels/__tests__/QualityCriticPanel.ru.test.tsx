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
  effectiveModel.mockReset().mockReturnValue(null);
  const chapters = [
    { chapter_id: 'ch1', title: 'Chapter One', original_filename: 'ch1.txt', sort_order: 1, draft_updated_at: '2026-11-08T00:00:00Z', draft_revision_count: 1 },
  ];
  listChapters.mockResolvedValue({ items: chapters, total: 1 });
  listChaptersPage.mockResolvedValue({ items: chapters, total: 1, next_cursor: null });
});

describe('Russian Quality critic UI', () => {
  it('renders batch controls and composition score dimensions in Russian', async () => {
    effectiveModel.mockReturnValue({ model_source: 'user_model', model_ref: 'model-1' });
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    qualityReport.mockResolvedValue({ report: { scope: { partial: false, complete: true, synthesis_completed: true }, critic: { coherence: 4, voice_match: 3, pacing: 2, canon_consistency: 5, violations: [] } } });
    withHost('b1');
    await screen.findByRole('option', { name: 'Chapter One' });
    expect(screen.getByText('Критический разбор всей книги')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбранная глава' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Все главы' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Проанализировать все главы' }));
    const entry = await screen.findByTestId('quality-critic-batch-entry-ch1');
    for (const dim of ['coherence', 'voice_match', 'pacing', 'canon_consistency'] as const) {
      expect(entry).toHaveTextContent(compositionRu[dim]);
    }
    expect(screen.getByRole('button', { name: 'Все главы проанализированы' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Очистить результаты' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('quality-critic-batch-scope-selected'));
    expect(screen.getByRole('button', { name: 'Проанализировать выбранную главу' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('qualityDim_');
  });
  for (const reason of ['context_limit', 'network', 'unavailable', 'reasoning_exhausted', 'truncated', 'invalid_response'] as const) {
    it(`restores cached scope and Russian ${reason} without automatic retry`, async () => {
      effectiveModel.mockReturnValue({ model_source: 'user_model', model_ref: 'model-1' });
      useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
      const key = 'lw_critic_batch:b1:proj-1:user_model:model-1';
      localStorage.setItem(key, JSON.stringify([{
        chapterId: 'ch1', title: 'Chapter One', sortOrder: 1,
        draftUpdatedAt: '2026-11-08T00:00:00Z', draftRevisionCount: 1, failed: true,
        report: { scope: { partial: true, chapter_partial: true, windows_analyzed: 1, windows_total: 7 },
          critic: { coherence: null, voice_match: null, pacing: null, canon_consistency: null, violations: [], error: `critic_${reason}` } },
      }]));
      withHost('b1');
      await screen.findByTestId('quality-critic-batch-entry-ch1');
      expect(screen.getByTestId('quality-reason')).toHaveTextContent(compositionRu.qualityReasons[reason]);
      expect(screen.getByTestId('quality-reason')).toHaveTextContent(compositionRu.qualityReasons.manualRetry);
      expect(screen.getByTestId('quality-partial')).toHaveTextContent('1 из 7');
      expect(qualityReport).not.toHaveBeenCalled();
      qualityReport.mockResolvedValue({ report: { critic: { coherence: 4, voice_match: 3, pacing: 2, canon_consistency: 5, violations: [] }, scope: { partial: true, chapter_partial: true, windows_analyzed: 1, windows_total: 9 } } });
      await waitFor(() => expect(screen.getByTestId('quality-critic-batch')).toBeEnabled());
      fireEvent.click(screen.getByTestId('quality-critic-batch'));
      await waitFor(() => expect(qualityReport).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByTestId('quality-partial')).toHaveTextContent('1 из 9'));
      await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!)[0].report.scope.windows_total).toBe(9));
      expect(screen.queryByRole('button', { name: 'Все главы проанализированы' })).not.toBeInTheDocument();
    });
  }
  it('renders chapter loading failures in Russian', async () => {
    useWorkResolution.mockReturnValue({ isLoading: false, data: { status: 'found', work: { project_id: 'proj-1' } } });
    listChaptersPage.mockRejectedValue(new Error('offline'));
    withHost('b1');
    expect(await screen.findByText('Не удалось загрузить список глав.')).toBeInTheDocument();
  });
});
