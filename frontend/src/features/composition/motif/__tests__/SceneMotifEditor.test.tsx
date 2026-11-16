import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneMotifEditor } from '../components/SceneMotifEditor';
import { motifApi } from '../api';
vi.mock('../api', () => ({ motifApi: { saveSceneMotif: vi.fn(), saveSceneRole: vi.fn() } }));
vi.mock('../hooks/useMotifBindings', () => ({ useMotifBindings: () => ({ isSuccess: true, data: { bindings: {} } }) }));
vi.mock('../../hooks/useGlossaryRoster', () => ({ useGlossaryRoster: () => ({ data: [{ id: 'entity', label: 'Authored character' }] }) }));
vi.mock('../hooks/useSceneMotifCandidates', () => ({ useSceneMotifCandidates: () => ({ isSuccess: true, data: [{ id: 'm', name: 'Server localized name', code: 'CODE', summary: 'Server preview', roles: [{ key: 'hero', label: 'Server localized role' }], beats: [] }] }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
function setup(sceneTitle?: string) {
 const qc = new QueryClient();
 render(<QueryClientProvider client={qc}><SceneMotifEditor projectId="p" bookId="b" chapterId="c" sceneId="s" sceneTitle={sceneTitle} token="auth" /></QueryClientProvider>);
 fireEvent.click(screen.getByText('motif.editor.open'));
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(motifApi.saveSceneMotif).mockResolvedValue({}); vi.mocked(motifApi.saveSceneRole).mockResolvedValue({}); });
describe('contextual scene motif editor', () => {
 it.each(['Named scene', 'Scene 2 · chapter-c'])('identifies the scene in the dialog title: %s', (title) => {
  setup(title);
  expect(screen.getByRole('dialog', { name: `motif.editor.title — ${title}` })).toBeInTheDocument();
 });
 it('keeps a chapter identity when the scene has no title', () => {
  setup('   ');
  expect(screen.getByRole('dialog', { name: 'motif.editor.title — untitledScene · c' })).toBeInTheDocument();
 });
 it('previews server labels and keeps motif/role edits local until Save', async () => {
  setup(); fireEvent.change(screen.getByLabelText('motif.editor.motif'), { target: { value: 'm' } });
  expect(screen.getByText('Server preview')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Server localized role'), { target: { value: 'entity' } });
  expect(motifApi.saveSceneMotif).not.toHaveBeenCalled(); expect(motifApi.saveSceneRole).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('motif.editor.save'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(motifApi.saveSceneRole).toHaveBeenCalledWith('p', 's', 'hero', 'entity', 'auth');
 });
 it('Escape on a dirty draft asks before discarding; Cancel never writes', async () => {
  setup(); fireEvent.change(screen.getByLabelText('motif.editor.motif'), { target: { value: 'm' } });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.getByText('motif.editor.discardTitle')).toBeInTheDocument());
  expect(screen.getAllByText('motif.editor.discardDescription')).toHaveLength(1);
  fireEvent.click(screen.getByText('motif.editor.stay'));
  fireEvent.click(screen.getByText('motif.editor.cancel'));
  fireEvent.click(screen.getByText('motif.editor.discard'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(motifApi.saveSceneMotif).not.toHaveBeenCalled();
 });
});
