import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { OutlineNode } from '@/features/composition/types';
import { ReferenceShelf } from '../ReferenceShelf';
import { referenceShelfApi, referenceSources } from '../../referenceShelfApi';
vi.mock('@/components/model-picker', () => ({ ModelPicker: () => <div /> }));
vi.mock('../../referenceShelfApi', async importOriginal => ({ ...await importOriginal<typeof import('../../referenceShelfApi')>(), referenceShelfApi: { list: vi.fn(), ask: vi.fn() } }));
it('shows eight exact groups, partial errors and caps; navigates only supported thread ids', async () => {
  const open = vi.fn();
  const select = vi.fn();
  vi.mocked(referenceShelfApi.list).mockResolvedValue({ book_id: 'b', entity_id: 'e', _meta: { note: '' }, sources: {
    outline_pov: { count: 42, has_more: true, refs: [{ source: 'outline_pov', node_ref: { kind: 'chapter', id: 'outline-not-manuscript', title: 'Planned chapter' }, detail: 'POV' }] },
    canon_rule: { error: 'database unavailable' },
    narrative_thread: { count: 1, has_more: false, refs: [{ source: 'narrative_thread', node_ref: { kind: 'narrative_thread', id: 'thread-id', title: 'Open promise' }, detail: 'open' }] },
  } });
  render(<QueryClientProvider client={new QueryClient()}><ReferenceShelf bookId="b" token="t" node={{ id: 'n', pov_entity_id: 'e' } as OutlineNode} roster={[{ id: 'e', label: 'Entity' }]} onOpenRef={open} onSelectReferenceNode={select} /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('Planned chapter')).toBeInTheDocument());
  for (const source of referenceSources) expect(screen.getByTestId(`reference-source-${source}`)).toBeInTheDocument();
  expect(screen.getByText(/\(42\)/)).toBeInTheDocument();
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByText('Planned chapter'));
  expect(select).toHaveBeenCalledWith('outline-not-manuscript');
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Open promise'));
  expect(open).toHaveBeenCalledWith({ kind: 'thread', id: 'thread-id', line: 'Open promise' }, 'n');
  expect(referenceShelfApi.ask).not.toHaveBeenCalled();
});
