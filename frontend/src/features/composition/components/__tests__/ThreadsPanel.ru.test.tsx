import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadsPanel } from '../ThreadsPanel';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import ruComposition from '@/i18n/locales/ru/composition.json';
vi.unmock('react-i18next');
const ru = createInstance();
await ru.use(initReactI18next).init({ lng: 'ru', fallbackLng: false, resources: { ru: { composition: ruComposition } }, interpolation: { escapeValue: false } });
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NarrativeThread } from '../../types';

// T0.1 — mock the read hook; assert the panel's behavior (filter status arg,
// open-count, status→token, gating, empty/error) via test-ids + attributes
// (composition tests use real i18n, so we avoid translated-text assertions).
const { threadsHook } = vi.hoisted(() => ({ threadsHook: vi.fn() }));
vi.mock('../../hooks/useNarrativeThreads', () => ({
  useNarrativeThreads: (...args: unknown[]) => threadsHook(...args),
}));

function thread(over: Partial<NarrativeThread>): NarrativeThread {
  return {
    id: 't1', project_id: 'p', user_id: 'u', kind: 'promise', status: 'open',
    opened_at_node: null, payoff_node: null, priority: 50,
    summary: 'the missing letter', version: 1, ...over,
  };
}

function mockQuery(over: Partial<{ data: unknown; isLoading: boolean; isError: boolean }>) {
  threadsHook.mockReturnValue({ data: undefined, isLoading: false, isError: false, ...over });
}

beforeEach(() => { threadsHook.mockReset(); });

describe('Russian promise actions', () => {
  it('renders localized edit and archive accessibility labels', () => {
    mockQuery({ data: { threads: [thread({})], open_count: 1 } });
    render(<I18nextProvider i18n={ru}><QueryClientProvider client={new QueryClient()}><ThreadsPanel projectId="p" token="t" enabled /></QueryClientProvider></I18nextProvider>);
    expect(screen.getByRole('button', { name: 'Редактировать обещание' })).toHaveAttribute('title', 'Редактировать обещание');
    expect(screen.getByRole('button', { name: 'Архивировать обещание' })).toHaveAttribute('title', 'Архивировать обещание');
  });
});
