import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IDockviewPanelProps } from 'dockview-react';
import { StudioHostProvider } from '../../host/StudioHostProvider';

vi.mock('@/auth', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
vi.mock('@/features/composition/hooks/useActiveWork', () => ({
  useActiveWorkId: () => ({ data: undefined }),
}));
vi.mock('@/features/composition/components/ThreadsPanel', () => ({
  ThreadsPanel: () => <div data-testid="stub-threads" />,
}));
vi.mock('@/components/model-picker', () => ({
  ModelPicker: () => null,
  useUserModels: () => ({
    models: [{ user_model_id: 'model-1', alias: 'qwen3.8-27b', provider_model_name: 'qwen3.8-27b', max_output_tokens: 8192 }],
  }),
}));

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess, info: vi.fn() } }));

const detectThreads = vi.fn().mockResolvedValue({ opened: 0, paid: 0, status: 'ok' });
const threadsAssistant = vi.fn();
const threadsAdopt = vi.fn();

vi.mock('@/features/composition/api', () => ({
  compositionApi: {
    resolveWork: vi.fn().mockResolvedValue({
      status: 'found',
      work: {
        project_id: 'proj-1',
        settings: { narrative_thread_enabled: true, default_model_ref: 'model-1' },
      },
      candidates: [],
      book_project_id: null,
      book_project_ids: [],
    }),
    detectThreads: (...a: unknown[]) => detectThreads(...a),
    threadsAssistant: (...a: unknown[]) => threadsAssistant(...a),
    threadsAdopt: (...a: unknown[]) => threadsAdopt(...a),
  },
}));
vi.mock('@/features/books/api', () => ({
  booksApi: {
    listChapters: vi.fn().mockResolvedValue({
      items: [{ chapter_id: 'ch-1', title: 'Глава 1', sort_order: 1 }],
      total: 1,
    }),
  },
}));

import { QualityPromisesPanel } from '../QualityPromisesPanel';

const REPORT = {
  promises: [{ kind: 'foreshadow', summary: 'Шрам на руке не объяснён', quote: 'старый шрам' }],
  paid: [],
  chains: [{ summary: 'Цепочка предательства', anchor: 'гл. 2', beats: ['намёк', 'подозрение'] }],
  critic: ['Обещание открыто, но не подсвечено эмоционально.'],
  canon_issues: ['Правило «магия стоит HP» — упомянуто заклинание без цены.'],
};

function dockProps() {
  return { api: { setTitle: vi.fn() } } as unknown as IDockviewPanelProps;
}

const selection = vi.hoisted(() => ({ current: null as null | { model_source: 'platform_model'; model_ref: string } }));
vi.mock('@/features/chat-ai-settings/context/ChatAiSettingsContext', () => ({
  useEffectiveModelSelection: () => selection.current,
}));

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StudioHostProvider bookId="b1"><QualityPromisesPanel {...dockProps()} /></StudioHostProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  selection.current = null;
  detectThreads.mockReset().mockResolvedValue({ opened: 0, paid: 0, status: 'ok' });
  toastError.mockClear();
  toastSuccess.mockClear();
  threadsAssistant.mockReset().mockResolvedValue(REPORT);
  threadsAdopt.mockReset().mockResolvedValue({ created: 1 });
});

describe('QualityPromisesPanel — ИИ-помощник report (#user-report 2026-11-08)', () => {
  it('preserves inherited platform model source for assistant execution', async () => {
    selection.current = { model_source: 'platform_model', model_ref: 'platform-1' };
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('quality-promises-assistant')).toBeEnabled());
    await user.click(screen.getByTestId('quality-promises-assistant'));
    await waitFor(() => expect(threadsAssistant).toHaveBeenCalledWith('proj-1', expect.objectContaining({ model_source: 'platform_model', model_ref: 'platform-1' }), 'tok'));
  });

  it.each(['degraded', 'empty', 'rejected'])('never reports a failed batch as success: %s', async (status) => {
    if (status === 'rejected') detectThreads.mockRejectedValueOnce(new Error('offline'));
    else detectThreads.mockResolvedValueOnce({ status, opened: 0, paid: 0 });
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('quality-promises-batch')).toBeEnabled());
    await user.click(screen.getByTestId('quality-promises-batch'));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(detectThreads).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('does not persist assistant report content in localStorage', async () => {
    const store = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('quality-promises-assistant')).toBeEnabled());
    await user.click(screen.getByTestId('quality-promises-assistant'));
    await waitFor(() => expect(screen.getByTestId('quality-promises-report')).toBeInTheDocument());
    expect(store.mock.calls.some(([key]) => key.startsWith('lw_promises_report:'))).toBe(false);
    store.mockRestore();
  });

  it('renders the four report sections after the assistant CTA', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('quality-promises-chapter')).toBeInTheDocument());
    await user.click(screen.getByTestId('quality-promises-assistant'));
    await waitFor(() => expect(screen.getByTestId('quality-promises-report')).toBeInTheDocument());
    // the four sections
    expect(screen.getByText('Шрам на руке не объяснён')).toBeInTheDocument();
    expect(screen.getByText('Обещание открыто, но не подсвечено эмоционально.')).toBeInTheDocument();
    expect(screen.getByText('Цепочка предательства')).toBeInTheDocument();
    expect(screen.getByText(/магия стоит HP/)).toBeInTheDocument();
    // the model budget was threaded into the call
    expect(threadsAssistant).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ chapter_id: 'ch-1', max_output_tokens: expect.any(Number) }),
      'tok',
    );
  });

  it('adopt moves a proposed promise into the ledger', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('quality-promises-chapter')).toBeInTheDocument());
    await user.click(screen.getByTestId('quality-promises-assistant'));
    await waitFor(() => expect(screen.getByTestId('quality-promises-report')).toBeInTheDocument());
    await user.click(screen.getByTestId('quality-promises-adopt-0'));
    await waitFor(() => expect(threadsAdopt).toHaveBeenCalledWith(
      'proj-1',
      { items: [{ kind: 'foreshadow', summary: 'Шрам на руке не объяснён' }] },
      'tok',
    ));
    // adopted proposals leave the report list
    expect(screen.queryByText('Шрам на руке не объяснён')).toBeNull();
  });
});
