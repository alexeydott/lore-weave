import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/shared/AddModelCta', () => ({ AddModelCta: () => null }));
vi.mock('@/lib/syncPrefs', () => ({
  loadPrefFromServer: vi.fn().mockResolvedValue(undefined),
  savePrefToServer: vi.fn().mockResolvedValue(true),
  syncPrefsToServer: vi.fn(),
}));

const listUserModels = vi.fn();
vi.mock('@/features/ai-models/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/ai-models/api')>();
  return {
    ...actual,
    aiModelsApi: {
      listUserModels: (...a: unknown[]) => listUserModels(...a),
      patchFavorite: vi.fn(),
    },
  };
});

const getDefaults = vi.fn();
const setDefault = vi.fn();
vi.mock('../api', () => ({
  RERANK_CAPABILITY: 'rerank',
  EMBEDDING_CAPABILITY: 'embedding',
  PLANNER_CAPABILITY: 'planner',
  CHAT_CAPABILITY: 'chat',
  COMPOSER_CAPABILITY: 'composer',
  // #270 — the backend resolves and VALIDATES these roles (provider-registry
  // default_models_handler: chat-flag family); the settings surface must offer them.
  CRITIC_ROLE: 'critic',
  DISTILL_ROLE: 'distill',
  defaultModelsApi: {
    get: (...a: unknown[]) => getDefaults(...a),
    set: (...a: unknown[]) => setDefault(...a),
  },
}));

// #facade — default→session propagation uses the chat sessions API.
const listChatSessions = vi.fn();
const patchChatSession = vi.fn();
vi.mock('@/features/chat/api', () => ({
  chatApi: {
    listSessions: (...a: unknown[]) => listChatSessions(...a),
    patchSession: (...a: unknown[]) => patchChatSession(...a),
  },
}));

import { DefaultModelsCard } from '../DefaultModelsCard';
import settingsEn from '../../../i18n/locales/en/settings.json';
import { invalidateUserModelsCache } from '@/components/model-picker';

// F15 (round 4) + #326 (Codex P1) — the critic hint must describe the real
// fallback: evaluate.py resolves the critic default, falls back to the chat
// default as judge, and refuses only when no model distinct from the session
// actor resolves. It must never present "None" as a scoring opt-out ("falls
// back to nothing"). The vitest i18n mock ignores defaultValue, so this
// asserts on the en bundle — the string the app actually renders. The
// component defaultValue is kept byte-identical to it by hand. Non-en locales
// echo the English string per the repo ECHOED practice, except ru which
// carries a real translation (fac8291f precedent).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_CRITIC_HINT_EN =
  "Scores practice sessions. Optional — unset, scoring falls back to your chat default as judge. Scoring is refused when that model is the session's own model, or when no default is set — pick a critic that differs from your usual chat model. Generated-scene audits use the critic set per book in Composition → Settings.";
const EXPECTED_CRITIC_HINT_RU =
  'Оценивает тренировочные сессии. Необязательно — без неё судьёй выступает ваша чат-модель по умолчанию. Оценка отклоняется, если эта модель совпадает с моделью сессии или если модель по умолчанию не задана — выберите критика, отличного от вашей обычной чат-модели. Аудит сгенерированных сцен использует критика, заданного для книги в Composition → Настройки.';

function localeHint(locale: string): string {
  const file = resolve(__dirname, '../../../i18n/locales', locale, 'settings.json');
  const json = JSON.parse(readFileSync(file, 'utf8')) as {
    defaultModels?: { criticHint?: unknown };
  };
  const hint = json.defaultModels?.criticHint;
  if (typeof hint !== 'string' || !hint) throw new Error(`no defaultModels.criticHint in ${file}`);
  return hint;
}

describe('critic hint copy (F15 + #326)', () => {
  it('describes the chat-default fallback and the distinct-actor refusal', () => {
    const hint = localeHint('en');
    expect(hint).toBe(EXPECTED_CRITIC_HINT_EN);
    expect(hint).toContain('chat default');
    expect(hint).toMatch(/refused/);
  });

  it('never promises that unset means no scoring', () => {
    expect(localeHint('en')).not.toContain('falls back to nothing');
    expect(localeHint('en')).not.toContain('sessions are not scored');
  });

  it('never promises generated-scene audits from the account default', () => {
    expect(localeHint('en')).not.toContain('audits generated scenes');
    expect(localeHint('en')).toContain('Composition');
  });

  it('carries a real Russian translation, other locales echo the English copy', () => {
    expect(localeHint('ru')).toBe(EXPECTED_CRITIC_HINT_RU);
    for (const locale of ['ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'ms', 'pt-BR', 'th', 'tr', 'vi', 'zh-CN', 'zh-TW']) {
      expect(localeHint(locale)).toBe(EXPECTED_CRITIC_HINT_EN);
    }
  });

  it('component defaultValue matches the shipped English copy', () => {
    const tsx = readFileSync(resolve(__dirname, '../DefaultModelsCard.tsx'), 'utf8');
    // The defaultValue is a single-quoted TS string, so the apostrophe in
    // "session's" is escaped in source — unescape before comparing.
    expect(tsx.replaceAll("\\'", "'")).toContain(EXPECTED_CRITIC_HINT_EN);
    expect(tsx).not.toContain('falls back to nothing');
  });

  it('backend still falls an unset critic back to the chat default (evaluate.py Gate 2)', () => {
    const py = readFileSync(
      resolve(__dirname, '../../../../../services/chat-service/app/routers/evaluate.py'),
      'utf8',
    );
    const criticAt = py.indexOf('get_default_model("critic"');
    const chatAt = py.indexOf('get_default_model("chat"');
    expect(criticAt).toBeGreaterThan(-1);
    expect(chatAt).toBeGreaterThan(criticAt);
    expect(py).toContain('scoring needs a CRITIC model distinct');
  });
});

beforeEach(() => {
  listUserModels.mockReset();
  getDefaults.mockReset();
  setDefault.mockReset();
  localStorage.clear();
  invalidateUserModelsCache();
  listUserModels.mockResolvedValue({
    items: [
      { user_model_id: 'm1', provider_kind: 'lm_studio', provider_model_name: 'bge-reranker', alias: null, is_active: true, is_favorite: false, tags: [], created_at: '2026-01-01T00:00:00Z' },
    ],
  });
  getDefaults.mockResolvedValue({ defaults: {} });
  setDefault.mockResolvedValue({});
});

// Rows render the shared ModelPicker (W5): [0] chat, [1] rerank, [2] planner,
// [3] composer, [4] critic (#270), [5] distill (#270).
async function openRow(index: number) {
  const triggers = await screen.findAllByRole('combobox');
  fireEvent.click(triggers[index]);
  return triggers[index];
}

describe('DefaultModelsCard', () => {
  beforeEach(() => {
    listChatSessions.mockReset().mockResolvedValue({ items: [], next_cursor: null });
    patchChatSession.mockReset().mockResolvedValue({});
  });

  it('lists chat + rerank + planner models and persists a selected default', async () => {
    render(<DefaultModelsCard />);
    await waitFor(() => expect(listUserModels).toHaveBeenCalledWith('tok', { capability: 'rerank', include_inactive: false }));
    // Chat row (W5) + planner/critic/distill (roles with no model flag → list CHAT
    // models); the shared fetch cache dedupes the identical chat queries.
    await waitFor(() => expect(listUserModels).toHaveBeenCalledWith('tok', { capability: 'chat', include_inactive: false }));
    // Embedding is intentionally not exposed yet (query-time must match the
    // indexing model) → never queried.
    expect(listUserModels).not.toHaveBeenCalledWith('tok', { capability: 'embedding', include_inactive: false });

    const triggers = await screen.findAllByRole('combobox');
    // 6 rows: chat, rerank, planner, composer, critic, distill (#270).
    expect(triggers).toHaveLength(6);
    // Row [1] = rerank: open + pick the model.
    fireEvent.click(triggers[1]);
    fireEvent.click(await screen.findByText('bge-reranker'));
    await waitFor(() => expect(setDefault).toHaveBeenCalledWith('tok', 'rerank', 'm1'));
  });

  it('persists a planner default under the planner capability', async () => {
    render(<DefaultModelsCard />);
    await openRow(2);
    fireEvent.click(await screen.findByText('bge-reranker'));
    await waitFor(() => expect(setDefault).toHaveBeenCalledWith('tok', 'planner', 'm1'));
  });

  it('persists a chat default under the chat capability (W5 new row)', async () => {
    render(<DefaultModelsCard />);
    await openRow(0);
    fireEvent.click(await screen.findByText('bge-reranker'));
    await waitFor(() => expect(setDefault).toHaveBeenCalledWith('tok', 'chat', 'm1'));
  });

  // #facade — default→dependent propagation: sessions still pinned to the OLD
  // chat default follow the new one. Sessions deliberately set to another model
  // are untouched.
  it('moves sessions pinned to the OLD chat default onto the new default', async () => {
    listChatSessions.mockResolvedValue({
      items: [
        { session_id: 's-follow', model_ref: 'm-old' },
        { session_id: 's-other', model_ref: 'm-deliberate' },
        { session_id: 's-follow2', model_ref: 'm-old' },
      ],
      next_cursor: null,
    });
    getDefaults.mockResolvedValue({ defaults: { chat: 'm-old' } });
    render(<DefaultModelsCard />);
    await openRow(0);
    fireEvent.click(await screen.findByText('bge-reranker'));
    await waitFor(() => expect(setDefault).toHaveBeenCalledWith('tok', 'chat', 'm1'));
    await waitFor(() => {
      expect(patchChatSession).toHaveBeenCalledTimes(2);
      expect(patchChatSession).toHaveBeenCalledWith('tok', 's-follow', { model_source: 'user_model', model_ref: 'm1' });
      expect(patchChatSession).toHaveBeenCalledWith('tok', 's-follow2', { model_source: 'user_model', model_ref: 'm1' });
    });
    // Sessions deliberately on another model are not touched.
    expect(patchChatSession).not.toHaveBeenCalledWith('tok', 's-other', expect.anything());
  });

  // A chat default CHANGED while sessions are pinned to the old one is the only
  // propagation trigger; the rerank capability has no propagation at all.
  it('rerank default changes do not touch chat sessions', async () => {
    getDefaults.mockResolvedValue({ defaults: { rerank: 'm-old' } });
    render(<DefaultModelsCard />);
    await openRow(1);
    fireEvent.click(await screen.findByText('bge-reranker'));
    await waitFor(() => expect(setDefault).toHaveBeenCalledWith('tok', 'rerank', 'm1'));
    expect(patchChatSession).not.toHaveBeenCalled();

  // #270 — evaluate.py refuses to score and tells the user, verbatim: "Set a critic
  // model in Settings › Chat & AI › default models." That row did not exist. The
  // backend resolves AND validates the role; the surface must offer it.
  });
  it('persists a critic default under the critic role (#270)', async () => {
    render(<DefaultModelsCard />);
    await openRow(4);
    fireEvent.click(await screen.findByText('bge-reranker'));
    await waitFor(() => expect(setDefault).toHaveBeenCalledWith('tok', 'critic', 'm1'));
  });

  // #270 — internal.py falls distill back to chat silently, handing a reasoning
  // model a distill job (blank diary). The row makes the role settable.
  it('persists a distill default under the distill role (#270)', async () => {
    render(<DefaultModelsCard />);
    await openRow(5);
    fireEvent.click(await screen.findByText('bge-reranker'));
    await waitFor(() => expect(setDefault).toHaveBeenCalledWith('tok', 'distill', 'm1'));
  });

  it('preloads the existing defaults from the server (trigger shows the model)', async () => {
    getDefaults.mockResolvedValue({ defaults: { rerank: 'm1', planner: 'm1' } });
    render(<DefaultModelsCard />);
    await waitFor(() => {
      const triggers = screen.getAllByRole('combobox');
      expect(triggers[1]).toHaveTextContent('bge-reranker');
      expect(triggers[2]).toHaveTextContent('bge-reranker');
    });
  });

  it('clearing via the none option persists null', async () => {
    getDefaults.mockResolvedValue({ defaults: { rerank: 'm1' } });
    render(<DefaultModelsCard />);
    await waitFor(() => expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('bge-reranker'));
    await openRow(1);
    // "defaultModels.none" also renders as the other (unset) rows' trigger label
    // — target the listbox OPTION specifically.
    fireEvent.click(await screen.findByRole('option', { name: 'defaultModels.none' }));
    await waitFor(() => expect(setDefault).toHaveBeenCalledWith('tok', 'rerank', null));
  });
});

// #326 (Codex P1) — the critic hint must describe the real fallback: evaluate.py
// resolves the critic default, falls back to the chat default as judge, and
// refuses only when no model distinct from the session actor resolves. It must
// never present "None" as a scoring opt-out ("falls back to nothing").
// The vitest i18n mock ignores defaultValue, so this asserts on the en bundle —
// the string the app actually renders. The component defaultValue is kept
// byte-identical to it by hand.
describe('critic hint wording (#326)', () => {
  const hint = (settingsEn as { defaultModels: { criticHint: string } }).defaultModels.criticHint;

  it('describes the chat-default fallback and the distinct-actor refusal', () => {
    expect(hint).toContain('chat default');
    expect(hint).toMatch(/refused/);
  });

  it('never promises that unset means no scoring', () => {
    expect(hint).not.toContain('falls back to nothing');
    expect(hint).not.toContain('sessions are not scored');
  });

  // #326 (Codex P1, F2) — the account critic default does NOT enable
  // generated-scene audits: composition-service's `critic_policy.resolve_critic`
  // reads only the book's role map/scalars (`work.settings`), so a book without
  // a book-level critic reports NOT_CONFIGURED and skips the LLM critique.
  // The hint must stay scoped to practice-session scoring and point at the
  // per-book setting (Composition → Settings → Critic model) for scene audits.
  it('never promises generated-scene audits from the account default', () => {
    expect(hint).not.toContain('audits generated scenes');
    expect(hint).toContain('Composition');
  });
});
