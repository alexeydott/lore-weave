import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

const render_ = (modelRef = 'm') =>
  render(<QualityReportSection projectId="p" chapterId="c" token="t" modelRef={modelRef} />);

const fullReport: QualityReport = {
  scope: { partial: false, complete: true, synthesis_completed: true },
  critic: { coherence: 4, voice_match: 3, pacing: 5, canon_consistency: 2, violations: [{ rule_id: 'R1', violated: true, span: 'he said', why: 'wrong pronoun' }] },
  threads: { selection: { exhaustive: true }, raised: ['thread-a', 'thread-b'], resolved: ['thread-a'], raised_count: 2, resolved_count: 1 },
};

describe('QualityReportSection', () => {
  it('runs the analysis on click', () => {
    const run = vi.fn();
    state.value = base({ run });
    render_();
    fireEvent.click(screen.getByTestId('quality-run'));
    expect(run).toHaveBeenCalled();
  });

  it('disables the button with no model', () => {
    state.value = base();
    render_('');
    expect((screen.getByTestId('quality-run') as HTMLButtonElement).disabled).toBe(true);
  });

  // NOTE: the global react-i18next mock returns KEYS (with interpolation), not English
  // defaultValues — repo test convention. So translated labels assert on keys; data on values.
  it('renders critic dims, violations and the threads raised (informational, not a defect)', () => {
    state.value = base({ report: fullReport, ran: true });
    render_();
    expect(screen.getByTestId('quality-critic').textContent).toContain('4/5');       // data
    expect(screen.getByTestId('quality-violations').textContent).toContain('wrong pronoun'); // data
    const threads = screen.getByTestId('quality-threads');
    expect(threads.textContent).toContain('thread-b');        // raised thread (data)
    expect(threads.textContent).toContain('qualityThreadsRaised'); // neutral "raised" label, not "dropped"
    expect(threads.textContent).not.toContain('dropped');     // the false-positive alarm is gone
  });

  it('shows a clean state when no threads are raised', () => {
    state.value = base({
      ran: true,
      report: { ...fullReport, threads: { ...fullReport.threads, raised: [], raised_count: 0 } },
    });
    render_();
    expect(screen.getByTestId('quality-threads').textContent).toContain('qualityNoThreads');
  });

  it('shows a hint when the thread audit is unavailable (not silent)', () => {
    state.value = base({
      ran: true,
      report: { ...fullReport, threads: { ...fullReport.threads, error: 'audit_error' } },
    });
    render_();
    expect(screen.getByTestId('quality-threads-na')).toBeTruthy();
    expect(screen.queryByTestId('quality-threads')).toBeNull();
  });

  const _prop = (over: Record<string, unknown> = {}) => ({
    id: 'e0', type: 'address', tier: 'semantic' as const, start: 0, end: 7,
    before: '', after: 'y', issue: '', fix: '', ...over,
  });

  it('links a critic violation to a matching self-heal proposal (D-QUALITY-CRITIC-HEAL-LINK)', () => {
    state.value = base({ report: fullReport, ran: true });   // violation span = 'he said'
    render(<QualityReportSection projectId="p" chapterId="c" token="t" modelRef="m"
      proposals={[_prop({ before: 'He said the words' })]} />);  // before ⊃ span → linked
    expect(screen.getByTestId('violation-has-fix')).toBeTruthy();
  });

  it('shows no fix-link when no proposal matches the violation span', () => {
    state.value = base({ report: fullReport, ran: true });
    render(<QualityReportSection projectId="p" chapterId="c" token="t" modelRef="m"
      proposals={[_prop({ before: 'a completely unrelated span' })]} />);
    expect(screen.queryByTestId('violation-has-fix')).toBeNull();
  });

  it('degrades gracefully when the critic is unavailable', () => {
    state.value = base({
      ran: true,
      report: { ...fullReport, critic: { coherence: null, voice_match: null, pacing: null, canon_consistency: null, violations: [], error: 'critic_unavailable' } },
    });
    render_();
    expect(screen.getByTestId('quality-critic').textContent).toContain('qualityReasons.unavailable');
  });
});


describe('complete quality scope', () => {
  it('does not mistake missing completion metadata for a clean exhaustive audit', () => {
    state.value = base({ ran: true, report: { ...fullReport, scope: undefined, threads: { ...fullReport.threads, raised: [], raised_count: 0 } } });
    render_();
    expect(screen.queryByText('qualityNoThreads')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quality-complete')).not.toBeInTheDocument();
  });
  it('shows complete only with successful synthesis and preserves more than twelve merged threads', () => {
    const raised = Array.from({ length: 25 }, (_, i) => 'thread-' + i);
    state.value = base({ ran: true, report: { ...fullReport, threads: { ...fullReport.threads, selection: { exhaustive: false, max_promises: null, per_call_max_promises: 12 }, raised, raised_count: 25 } } });
    render_();
    expect(screen.getByTestId('quality-complete')).toBeInTheDocument();
    expect(screen.getByTestId('quality-threads')).toHaveTextContent('thread-24');
    expect(screen.getByTestId('quality-threads-selection').textContent).not.toContain('undefined');
  });
  it('shows incomplete synthesis instead of completion', () => {
    state.value = base({ ran: true, report: { ...fullReport, scope: { partial: true, complete: false, synthesis_completed: false } } });
    render_();
    expect(screen.getByTestId('quality-partial')).toHaveTextContent('qualityScope.synthesisPending');
    expect(screen.queryByTestId('quality-complete')).not.toBeInTheDocument();
  });
});
