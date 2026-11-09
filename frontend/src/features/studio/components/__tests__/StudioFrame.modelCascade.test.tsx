// Integration regression for ff0d9a05: Quality panels must be descendants of the
// real book-scoped settings provider, not merely receive a mocked effective-model hook.
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectiveSettings } from '@/features/chat-ai-settings/types';

const h = vi.hoisted(() => ({ getEffective: vi.fn() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ accessToken: 'token' }) }));
vi.mock('@/features/chat-ai-settings/api', () => ({ aiSettingsApi: { getEffective: h.getEffective } }));
vi.mock('@/lib/syncPrefs', () => ({
  loadPrefFromServer: vi.fn().mockResolvedValue(null),
  savePrefToServer: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/features/books/api', () => ({ booksApi: {
  getBook: vi.fn().mockResolvedValue({ title: 'Book' }),
  listChapters: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  listChaptersPage: vi.fn().mockResolvedValue({ items: [], total: 0, next_cursor: null }),
} }));
vi.mock('@/features/composition/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/composition/api')>(), compositionApi: {
  resolveWork: vi.fn(async (bookId: string) => ({
    status: 'found', candidates: [],
    work: { project_id: `project-${bookId}`, book_id: bookId,
      settings: { narrative_thread_enabled: true } },
  })),
} }));
vi.mock('@/components/model-picker', () => ({
  useUserModels: () => ({ models: [{ user_model_id: 'inventory-model', alias: 'Inventory', provider_model_name: 'Inventory' }] }),
  ModelPicker: ({ value }: { value: string | null }) => <output data-testid="selected-model">{value ?? 'NONE'}</output>,
}));
vi.mock('@/features/composition/components/ThreadsPanel', () => ({ ThreadsPanel: () => null }));
vi.mock('@/features/composition/components/BookPromiseCoverageSection', () => ({ BookPromiseCoverageSection: () => null }));

// Replace dock geometry, not the panels or either React context. The real frame
// determines whether these consumers are inside ChatAiSettingsProvider.
vi.mock('../StudioDock', async () => {
  const { QualityCriticPanel } = await import('../../panels/QualityCriticPanel');
  const { QualityConformancePanel } = await import('../../panels/QualityConformancePanel');
  const { QualityCoveragePanel } = await import('../../panels/QualityCoveragePanel');
  const { QualityHealPanel } = await import('../../panels/QualityHealPanel');
  const { QualityPromisesPanel } = await import('../../panels/QualityPromisesPanel');
  const panels = { critic: QualityCriticPanel, conformance: QualityConformancePanel,
    coverage: QualityCoveragePanel, heal: QualityHealPanel, promises: QualityPromisesPanel };
  const props = { api: { setTitle: vi.fn() } } as unknown as import('dockview-react').IDockviewPanelProps;
  return { StudioDock: () => <>{Object.entries(panels).map(([id, Panel]) => (
    <section key={id} data-testid={`dock-${id}`}><Panel {...props} /></section>
  ))}</> };
});
vi.mock('../../panels/catalog', () => ({ OPENABLE_STUDIO_PANELS: [], getStudioPanelDef: (id: string) => ({ tourAnchor: `studio-${id}-panel` }) }));
vi.mock('../../manuscript/unit/ManuscriptUnitProvider', () => ({ ManuscriptUnitProvider: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('../../palette/QuickOpen', () => ({ QuickOpen: () => null }));
vi.mock('../../palette/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../statusbar/StudioStatusContributions', () => ({ StudioStatusContributions: () => null }));
vi.mock('../../onboarding/StudioOnboardingOverlay', () => ({ StudioOnboardingOverlay: () => null }));
vi.mock('../../onboarding/StudioGuidedTour', () => ({ StudioGuidedTour: () => null }));
vi.mock('../StudioTopBar', () => ({ StudioTopBar: () => null }));
vi.mock('../StudioActivityBar', () => ({ StudioActivityBar: () => null }));
vi.mock('../StudioSideBar', () => ({ StudioSideBar: () => null }));
vi.mock('../StudioBottomPanel', () => ({ StudioBottomPanel: () => null }));
vi.mock('../StudioStatusBar', () => ({ StudioStatusBar: () => null }));

import { WritingStudioPage } from '@/pages/WritingStudioPage';

const PANEL_IDS = ['critic', 'conformance', 'coverage', 'heal', 'promises'];
function effective(bookId: string, model: string | null, tier = 'book'): EffectiveSettings {
  return { context_ref: { book_id: bookId, session_id: null }, models: { chat: {
    effective_value: model ? { model_source: 'user_model', model_ref: model } : null,
    source_tier: model ? tier : 'no_model_configured',
    tier_stack: model ? { [tier]: { model_source: 'user_model', model_ref: model } } : {}, skipped: [],
  } }, behavior: {}, grounding: {}, voice: {}, context: {} };
}
function Navigation() {
  const navigate = useNavigate();
  return <>{['a', 'b', 'c'].map((id) => <button key={id} onClick={() => navigate(`/books/${id}/studio`)}>Book {id}</button>)}</>;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/books/a/studio']}>
    <Navigation /><Routes><Route path="/books/:bookId/studio" element={<WritingStudioPage />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
}
async function expectModels(model: string) {
  await waitFor(() => {
    for (const id of PANEL_IDS) {
      expect(within(screen.getByTestId(`dock-${id}`)).getByTestId('selected-model')).toHaveTextContent(model);
    }
  });
}

beforeEach(() => { localStorage.clear(); h.getEffective.mockReset(); });

describe('StudioFrame Quality model cascade integration', () => {
  it('places all five real Quality panels under the book-scoped provider', async () => {
    h.getEffective.mockImplementation(async (_token, { bookId }) => effective(bookId, `model-${bookId}`));
    mount();
    await expectModels('model-a');
    expect(h.getEffective).toHaveBeenCalledWith('token', { bookId: 'a', sessionId: undefined });
    expect(h.getEffective).toHaveBeenCalledTimes(1);
  });

  it('inherits the resolved account model, then inventory fallback when no model is configured', async () => {
    h.getEffective.mockImplementation(async (_token, { bookId }) =>
      effective(bookId, bookId === 'a' ? 'account-model' : null, 'account'));
    mount();
    await expectModels('account-model');
    fireEvent.click(screen.getByText('Book b'));
    await expectModels('inventory-model');
    await waitFor(() => expect(h.getEffective).toHaveBeenCalledWith('token', { bookId: 'b', sessionId: undefined }));
  });

  it('isolates A → B → A and never shows A while B settings are pending', async () => {
    let resolveB!: (value: EffectiveSettings) => void;
    h.getEffective.mockImplementation((_token, { bookId }) => bookId === 'b'
      ? new Promise((resolve) => { resolveB = resolve; })
      : Promise.resolve(effective(bookId, `model-${bookId}`)));
    mount();
    await expectModels('model-a');
    fireEvent.click(screen.getByText('Book b'));
    await expectModels('inventory-model');
    await waitFor(() => expect(resolveB).toBeDefined());
    await act(async () => resolveB(effective('b', 'model-b')));
    await expectModels('model-b');
    fireEvent.click(screen.getByText('Book a'));
    await expectModels('model-a');
  });

  it('ignores a late settings response from an unmounted book', async () => {
    let resolveA!: (value: EffectiveSettings) => void;
    h.getEffective.mockImplementation((_token, { bookId }) => bookId === 'a'
      ? new Promise((resolve) => { resolveA = resolve; })
      : Promise.resolve(effective(bookId, 'model-b')));
    mount();
    await waitFor(() => expect(resolveA).toBeDefined());
    fireEvent.click(screen.getByText('Book b'));
    await expectModels('model-b');
    await act(async () => resolveA(effective('a', 'late-model-a')));
    await expectModels('model-b');
  });
});
