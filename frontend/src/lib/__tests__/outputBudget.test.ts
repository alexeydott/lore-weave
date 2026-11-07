import { describe, it, expect } from 'vitest';
import { computeMaxOutputTokens, clampOutputBudget } from '../outputBudget';

// Lockstep with Go: services/provider-registry-service/internal/api/
// output_budget_test.go — the same table, so the settings preview and the
// server-stored value can never drift.
describe('computeMaxOutputTokens (mirror of MaxOutputFromContext)', () => {
  it('derives nothing from an invalid context', () => {
    expect(computeMaxOutputTokens(null)).toBeNull();
    expect(computeMaxOutputTokens(0)).toBeNull();
    expect(computeMaxOutputTokens(-8)).toBeNull();
  });

  it('matches the Go table', () => {
    expect(computeMaxOutputTokens(4096)).toBe(1024);
    expect(computeMaxOutputTokens(8192)).toBe(2048);
    expect(computeMaxOutputTokens(16384)).toBe(4096);
    expect(computeMaxOutputTokens(32768)).toBe(8192);
    expect(computeMaxOutputTokens(131072)).toBe(32768);
    expect(computeMaxOutputTokens(1_000_000)).toBe(32768);
    expect(computeMaxOutputTokens(10_000)).toBe(2500);
  });
});

describe('clampOutputBudget', () => {
  it('passes valid budgets through (rounded)', () => {
    expect(clampOutputBudget(2048)).toBe(2048);
    expect(clampOutputBudget(1500.6)).toBe(1501);
  });

  it('lifts sub-floor values to the floor', () => {
    expect(clampOutputBudget(100)).toBe(1024);
  });

  it('caps above-ceiling values at the composition ceiling', () => {
    expect(clampOutputBudget(64000)).toBe(32768);
  });

  it('derives nothing from invalid input', () => {
    expect(clampOutputBudget(null)).toBeNull();
    expect(clampOutputBudget(0)).toBeNull();
  });
});
