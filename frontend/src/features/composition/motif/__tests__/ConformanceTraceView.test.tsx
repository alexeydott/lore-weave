// Regression (D-MOTIF-CONFORMANCE-CONTRACT) — the chapter conformance reader
// (GET …/conformance) returns {scope, chapter_id, calibrated, scenes} and does NOT
// emit `conform_count`. The panel is ALWAYS mounted (CSS-hidden) by CompositionPanel,
// so an unguarded `conf.conform_count[0]` white-screened the entire studio. Assert
// the view tolerates the real BE shape and only renders the count when present.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { number?: number }) => key === 'panels.scene-inspector.links.untitledScene' ? `Scene ${options?.number}` : key }) }));
const apiJson = vi.fn();
vi.mock('@/api', () => ({ apiJson: (...a: unknown[]) => apiJson(...a), apiBase: () => '' }));

import { ConformanceTraceView } from '../components/ConformanceTraceView';
import compositionEn from '@/i18n/locales/en/composition.json';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => apiJson.mockReset());

// NV-6: restoring the dash label failed the Bind motif role lookup; restoring the old
// empty CTA translation failed the exact label assertion. Both passed after restoration.
it('labels unbound navigation explicitly and preserves scene and chapter IDs', async () => {
  apiJson.mockResolvedValue({ chapter_id: 'c1', scenes: [
    { outline_node_id: 'unbound-scene', planned: { motif_id: null }, realized: { has_prose: false }, conformance: null },
    { outline_node_id: 'bound-scene', planned: { motif_id: 'm1', beat_key: 'reveal' }, realized: { has_prose: true }, conformance: null },
  ] });
  const open = vi.fn();
  render(<ConformanceTraceView projectId="p1" chapterId="c1" token="tok" onOpenScene={open} />, { wrapper: wrap() });
  const bind = await screen.findByRole('button', { name: 'motif.action.bind' });
  fireEvent.click(bind);
  expect(open).toHaveBeenLastCalledWith('unbound-scene', 'c1');
  fireEvent.click(screen.getByRole('button', { name: 'reveal' }));
  expect(open).toHaveBeenLastCalledWith('bound-scene', 'c1');
});

it('identifies unnamed rows by scene position and chapter while preserving named rows', async () => {
  apiJson.mockResolvedValue({ chapter_id: 'c1', scenes: [
    { outline_node_id: 'unnamed', title: '   ', planned: {}, realized: {}, conformance: null },
    { outline_node_id: 'named', title: 'Named scene', planned: {}, realized: {}, conformance: null },
  ] });
  render(<ConformanceTraceView projectId="p1" chapterId="c1" token="tok" />, { wrapper: wrap() });
  expect(await screen.findByTestId('conformance-row-unnamed')).toHaveTextContent('Scene 1 · c1');
  expect(screen.getByTestId('conformance-row-named')).toHaveTextContent('Named scene');
});

it('offers scene selection in the empty state and opens the chapter browser', async () => {
  expect(compositionEn.motif.conf.bindCta).toBe('Choose a scene to bind →');
  apiJson.mockResolvedValue({ chapter_id: 'c1', scenes: [] });
  const open = vi.fn();
  render(<ConformanceTraceView projectId="p1" chapterId="c1" token="tok" onOpenScene={open} />, { wrapper: wrap() });
  fireEvent.click(await screen.findByRole('button', { name: 'motif.conf.bindCta' }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith('', 'c1');
});

describe('ConformanceTraceView — missing conform_count must not crash', () => {
  it('renders the real BE shape (no conform_count) without throwing; count span omitted', async () => {
    apiJson.mockResolvedValue({ scope: 'chapter', chapter_id: 'c1', calibrated: false, scenes: [] });
    render(<ConformanceTraceView projectId="p1" chapterId="c1" token="tok" />, { wrapper: wrap() });
    // the panel mounts (no white-screen) and resolves to the empty state.
    expect(await screen.findByTestId('conformance-trace-view')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('conformance-empty')).toBeInTheDocument());
    // no "N/M" count is shown when the field is absent.
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull();
  });

  it('derives the [conforming/judged] count from the nested scene verdicts', async () => {
    const sc = (id: string, beat: boolean | null, band: boolean | null) => ({
      outline_node_id: id, title: id, beat_role: 'rising',
      planned: { motif_id: 'm1', motif_version: 1, beat_key: 'b', tension: 40, role_bindings: {} },
      realized: { job_id: 'j', has_prose: true },
      conformance: beat === null ? null : { beat_realized: beat, tension_band_match: band, calibrated: true },
    });
    // 3 judged scenes, 2 conforming; +1 unjudged (null verdict) is excluded from the denominator.
    apiJson.mockResolvedValue({
      scope: 'chapter', chapter_id: 'c1', calibrated: true,
      scenes: [sc('a', true, true), sc('b', true, true), sc('c', false, true), sc('d', null, null)],
    });
    render(<ConformanceTraceView projectId="p1" chapterId="c1" token="tok" />, { wrapper: wrap() });
    expect(await screen.findByTestId('conformance-count')).toHaveTextContent('2/3');
  });
});

it.each(['unavailable', 'no_bound_motif', 'motif_unavailable', 'no_manuscript_prose', 'stale'])('renders %s honestly without a positive verdict', async (status) => {
  apiJson.mockResolvedValue({ chapter_id: 'c1', calibrated: false, scenes: [{ outline_node_id: 's', planned: {}, realized: { has_prose: true }, check_status: status, conformance: { beat_realized: true, tension_band_match: true, calibrated: true } }] });
  render(<ConformanceTraceView projectId='p1' chapterId='c1' token='tok' />, { wrapper: wrap() });
  expect(await screen.findByTestId('conformance-unchecked-s')).not.toBeEmptyDOMElement();
  expect(screen.queryByTestId('conformance-tone-s')).toBeNull();
});
