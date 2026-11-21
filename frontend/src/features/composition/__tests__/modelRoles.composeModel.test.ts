import { describe, expect, it } from 'vitest';
import { patchForRole, resolveComposeModel } from '../modelRoles';

/** The inline-continue chain (16b774bd7), provable since 2026-11-21: the tier ran on a
 *  scalar-only read for two weeks — a Work default set through the model_roles MAP
 *  (the only form the UI writes) was invisible, and no test covered the map shape. */

const CHAT_SAFE = (m: { capability_flags?: Record<string, unknown> }) =>
  m.capability_flags?.chat === true;
const RERANK_STAMPED = (m: { capability_flags?: Record<string, unknown> }) =>
  m.capability_flags?.rerank === true;

const sole = [{ user_model_id: 'sole-1', is_active: true, capability_flags: { chat: true } }];
const soleRerank = [{ user_model_id: 'sole-rerank', is_active: true, capability_flags: { rerank: true, _capability: 'chat' } }];

describe('resolveComposeModel — Work ▸ session ▸ sole', () => {
  it('map-form Work default wins over the session pick and the sole model', () => {
    const settings = patchForRole({}, 'chat', 'work-map-model');
    expect(resolveComposeModel(settings, 'session-model', sole, CHAT_SAFE)).toBe('work-map-model');
  });

  it('legacy scalar Work default still resolves (pre-map writes)', () => {
    expect(resolveComposeModel({ default_model_ref: 'work-scalar' }, 'session-model', sole, CHAT_SAFE))
      .toBe('work-scalar');
  });

  it('session model applies when no Work default is set', () => {
    expect(resolveComposeModel({}, 'session-model', sole, CHAT_SAFE)).toBe('session-model');
    expect(resolveComposeModel(undefined, 'session-model', sole, CHAT_SAFE)).toBe('session-model');
  });

  it('sole chat-safe model applies with no Work default and no session', () => {
    expect(resolveComposeModel({}, null, sole, CHAT_SAFE)).toBe('sole-1');
    expect(resolveComposeModel({}, null, sole, RERANK_STAMPED)).toBeNull();
  });

  it('the sole slot refuses a rerank-stamped model even when the server filter passed it', () => {
    expect(resolveComposeModel({}, null, soleRerank, CHAT_SAFE)).toBeNull();
  });

  it('an inactive sole model is not auto-picked', () => {
    expect(resolveComposeModel({}, null, [{ user_model_id: 'dead', is_active: false, capability_flags: { chat: true } }], CHAT_SAFE))
      .toBeNull();
  });

  it('two chat models mean NO sole auto-pick (the tier needs exactly one)', () => {
    const two = [...sole, { user_model_id: 'sole-2', is_active: true, capability_flags: { chat: true } }];
    expect(resolveComposeModel({}, null, two, CHAT_SAFE)).toBeNull();
  });

  it('clearing a role removes the map entry AND nulls the legacy scalar (no phantom revival)', () => {
    const settings = patchForRole(patchForRole({}, 'chat', 'm'), 'chat', '');
    expect(resolveComposeModel(settings, null, sole, CHAT_SAFE)).toBe('sole-1');
  });
});
