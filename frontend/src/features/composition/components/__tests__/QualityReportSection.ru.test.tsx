import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import ruComposition from '@/i18n/locales/ru/composition.json';
vi.unmock('react-i18next');
const ru = createInstance();
await ru.use(initReactI18next).init({ lng: 'ru', fallbackLng: false, resources: { ru: { composition: ruComposition } }, interpolation: { escapeValue: false } });
import type { QualityReport } from '../../api';
import { QualityReportSection } from '../QualityReportSection';

// Pure view over useQualityReport — mock the controller and assert wiring + rendering.
const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../../hooks/useQualityReport', () => ({
  useQualityReport: () => state.value,
}));

function base(over: Record<string, unknown> = {}) {
  return { report: null as QualityReport | null, loading: false, error: null, ran: false, run: vi.fn(), ...over };
}

const fullReport: QualityReport = {
  critic: { coherence: 4, voice_match: 3, pacing: 5, canon_consistency: 2, violations: [{ rule_id: 'R1', violated: true, span: 'he said', why: 'wrong pronoun' }] },
  threads: { raised: ['thread-a', 'thread-b'], resolved: ['thread-a'], raised_count: 2, resolved_count: 1 },
};

describe('Russian operational reasons', () => {
  for (const prefix of ['critic', 'audit']) {
    for (const reason of ['context_limit', 'network', 'unavailable', 'reasoning_exhausted', 'truncated', 'invalid_response'] as const) {
      it(`renders ${prefix}_${reason} with manual retry guidance`, () => {
        const report = structuredClone(fullReport);
        if (prefix === 'critic') report.critic.error = `${prefix}_${reason}`;
        else report.threads.error = `${prefix}_${reason}`;
        state.value = base({ report, ran: true });
        render(<I18nextProvider i18n={ru}><QualityReportSection projectId="p" chapterId="c" token="t" modelRef="m" /></I18nextProvider>);
        expect(screen.getByTestId('quality-reason')).toHaveTextContent(ruComposition.qualityReasons[reason]);
        expect(screen.getByTestId('quality-reason')).toHaveTextContent(ruComposition.qualityReasons.manualRetry);
        expect(state.value.run).not.toHaveBeenCalled();
      });
    }
  }
  it('does not claim no chapter threads for a partial report', () => {
    const report = structuredClone(fullReport);
    report.scope = { partial: true, chapter_partial: true, windows_total: 8, windows_analyzed: 1, canon_partial: true, canon_lines_total: 20, canon_lines_selected: 3 };
    report.threads.raised = [];
    report.threads.raised_count = 0;
    state.value = base({ report, ran: true });
    render(<I18nextProvider i18n={ru}><QualityReportSection projectId="p" chapterId="c" token="t" modelRef="m" /></I18nextProvider>);
    expect(screen.getByTestId('quality-partial')).toHaveTextContent('Частичный отчёт');
    expect(screen.getByTestId('quality-partial')).toHaveTextContent('1 из 8');
    expect(screen.getByTestId('quality-partial')).toHaveTextContent('3 из 20');
    expect(screen.queryByText(ruComposition.qualityNoThreads)).not.toBeInTheDocument();
  });
});

describe('Russian thread selection notice', () => {
  it.each([false, true])('shows selection caps independently of partial input scope (%s)', (partial) => {
    const report = structuredClone(fullReport);
    report.threads.selection = { exhaustive: false, max_promises: 12, max_phrase_chars: 80 };
    report.threads.raised = [];
    report.threads.raised_count = 0;
    if (partial) report.scope = { partial: true, chapter_partial: true, windows_analyzed: 1, windows_total: 2 };
    state.value = base({ report, ran: true });
    render(<I18nextProvider i18n={ru}><QualityReportSection projectId="p" chapterId="c" token="t" modelRef="m" /></I18nextProvider>);
    expect(screen.getByTestId('quality-threads-selection')).toHaveTextContent('не исчерпывающий аудит');
    expect(screen.getByTestId('quality-threads-selection')).toHaveTextContent('12');
    expect(screen.getByTestId('quality-threads-selection')).toHaveTextContent('80');
    expect(screen.queryByTestId('quality-partial') !== null).toBe(partial);
    expect(screen.queryByText(ruComposition.qualityNoThreads)).not.toBeInTheDocument();
    expect(state.value.run).not.toHaveBeenCalled();
  });
  it.each([undefined, { exhaustive: true, max_promises: 12, max_phrase_chars: 80 }])('does not warn for uncapped results (%j)', (selection) => {
    const report = structuredClone(fullReport);
    report.threads.selection = selection;
    state.value = base({ report, ran: true });
    render(<I18nextProvider i18n={ru}><QualityReportSection projectId="p" chapterId="c" token="t" modelRef="m" /></I18nextProvider>);
    expect(screen.queryByTestId('quality-threads-selection')).not.toBeInTheDocument();
  });
});

describe('Russian quality report', () => {
  it('uses translated composition dimensions, not missing qualityDim keys', () => {
    state.value = base({ report: fullReport, ran: true });
    render(<I18nextProvider i18n={ru}><QualityReportSection projectId="p" chapterId="c" token="t" modelRef="m" /></I18nextProvider>);
    expect(screen.getByText('Отчет о качестве')).toBeInTheDocument();
    for (const dim of ['coherence', 'voice_match', 'pacing', 'canon_consistency'] as const) {
      expect(screen.getByTestId('quality-critic')).toHaveTextContent(ruComposition[dim]);
    }
    expect(screen.getByRole('button', { name: 'Переанализировать' })).toBeInTheDocument();
  });
});
