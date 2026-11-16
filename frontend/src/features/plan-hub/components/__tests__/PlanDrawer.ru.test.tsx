import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import ruStudio from '@/i18n/locales/ru/studio.json';
import type { PlanNodeView } from '../../hooks/usePlanNode';
import type { OutlineNode } from '@/features/composition/types';

vi.unmock('react-i18next');
const hook = vi.hoisted(() => ({ view: vi.fn() }));
vi.mock('../../hooks/usePlanNode', () => ({ usePlanNode: hook.view }));
vi.mock('@/features/studio/panels/ArcInspectorEmbed', () => ({ ArcInspectorEmbed: () => <div /> }));
vi.mock('@/features/composition/motif/components/MotifBindingLens', () => ({ MotifBindingLens: () => <div /> }));
vi.mock('../ReferenceShelf', () => ({ ReferenceShelf: () => <div /> }));
import { PlanDrawer } from '../PlanDrawer';

const i18n = createInstance();
await i18n.use(initReactI18next).init({ lng: 'ru', fallbackLng: false, resources: { ru: { studio: ruStudio } }, interpolation: { escapeValue: false } });
afterEach(cleanup);
const writes = { edit: vi.fn(), archive: vi.fn(), restore: vi.fn(), saving: false, error: null };
function show(kind: PlanNodeView['kind'], status: string, archived = false) {
  const node = { id: 'n', project_id: 'p', parent_id: null, rank: 'm', kind: 'chapter', title: 'Authored Chapter', chapter_id: 'c', story_order: 0, status, synopsis: 'Authored Synopsis', goal: 'Authored Goal', beat_role: 'custom-beat', version: 1, is_archived: archived } as OutlineNode;
  hook.view.mockReturnValue({ kind, loading: false, error: null, nameFor: (id: string) => id, outlineNode: kind === 'chapter' || kind === 'scene' ? node : null, arcNode: kind === 'arc' || kind === 'saga' ? { id: 'a', title: 'Authored Arc', status } : null });
  return render(<I18nextProvider i18n={i18n}><PlanDrawer selectedId="n" kind={kind} bookId="b" onClose={vi.fn()} writes={writes} onOpenInEditor={vi.fn()} /></I18nextProvider>);
}

describe('Plan drawer Russian UI without English fallback', () => {
  it.each(['chapter', 'scene'] as const)('%s localizes fields, edit actions and every status without translating authored data', (kind) => {
    for (const [status, label] of Object.entries(ruStudio.planHub.flow.status)) {
      show(kind, status);
      expect(screen.getByTestId('plan-drawer-status')).toHaveTextContent(label);
      expect(screen.getByTestId('plan-drawer-f-status')).toHaveTextContent(label);
      for (const [value, text] of Object.entries(ruStudio.planHub.flow.status)) {
        expect(screen.getByRole('option', { name: text })).toHaveValue(value);
      }
      const drawer = screen.getByTestId('plan-drawer');
      for (const label of ['Обзор', 'Статус', 'Цель', 'Синопсис', ruStudio['panels']['scene-inspector'].section.cast, ruStudio['panels']['scene-inspector'].section.craft, ...Object.values(ruStudio['panels']['scene-inspector'].f), 'Привязка', 'Открыть в редакторе']) {
        expect(drawer.textContent).toContain(label);
      }
      expect(screen.getByRole('button', { name: ruStudio.planner.list.archive })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: ruStudio.common.close })).toBeInTheDocument();
      expect(screen.getByTestId('plan-drawer-title')).toHaveTextContent('Authored Chapter');
      expect(screen.getByTestId('plan-drawer-f-goal')).toHaveTextContent('Authored Goal');
      expect(screen.getByTestId('plan-drawer-f-synopsis')).toHaveTextContent('Authored Synopsis');
      expect(screen.getByTestId('plan-drawer-f-beat')).toHaveTextContent('custom-beat');
      expect(drawer.textContent).not.toMatch(/Overview|Cast & Setting|Open in Editor|Archive|planHub\.|panels\./);
      cleanup();
    }
    show(kind, 'done', true);
    expect(screen.getByRole('button', { name: ruStudio.planner.list.restore })).toBeInTheDocument();
  });
  it.each(['arc', 'saga', 'unknown'] as const)('localizes the %s header and status', (kind) => {
    for (const [status, label] of Object.entries(ruStudio.planHub.flow.status)) {
      show(kind, status);
      expect(screen.getByTestId('plan-drawer')).toHaveTextContent(ruStudio.planHub.drawer[kind]);
      if (kind !== 'unknown') expect(screen.getByTestId('plan-drawer-status')).toHaveTextContent(label);
      cleanup();
    }
  });
  it('does not leak unknown machine statuses', () => {
    show('chapter', 'future_status');
    expect(screen.getByTestId('plan-drawer-status')).toHaveTextContent('Узел');
    expect(screen.getByTestId('plan-drawer').textContent).not.toContain('future_status');
  });
});
