// Visual audit 2026-11-13 (V1): every workspace panel id must resolve to a
// *string* label in the `composition` namespace. `compose` and `canonview`
// used to be nested objects there, so `t(id)` returned i18next's
// "returned an object instead of string" error text as the tab label —
// and the 60-char error string blew out the dock rail.
import { describe, it, expect } from 'vitest';
import en from '../../../../../i18n/locales/en/composition.json';
import ru from '../../../../../i18n/locales/ru/composition.json';
import { defaultLayout } from '../../../workspace/types';

const PANEL_IDS = Object.keys(defaultLayout().panels);

describe('workspace panel labels', () => {
  it('covers the 25 known panels', () => {
    expect(PANEL_IDS).toHaveLength(25);
    expect(PANEL_IDS).toContain('compose');
    expect(PANEL_IDS).toContain('canonview');
  });

  for (const [lng, json] of [
    ['en', en],
    ['ru', ru],
  ] as const) {
    it(`${lng}: every panel id maps to a string label`, () => {
      const flat = json as Record<string, unknown>;
      for (const id of PANEL_IDS) {
        expect(typeof flat[id], `${lng}:${id}`).toBe('string');
      }
    });
  }
});
