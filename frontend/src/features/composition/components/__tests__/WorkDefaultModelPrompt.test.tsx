import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// WorkDefaultModelPrompt — the explicit-consent bridge from the ACCOUNT chat
// default to the WORK tier. The contract:
//   • offers the copy ONLY when the Work's chat role is unset AND the account
//     has a chat default (no offer → no consent → no silent fallback);
//   • "apply" patches the Work settings with the model_roles chat entry;
//   • dismiss suppresses the offer for this Work.

const { useAuthMock, resolutionMock, activeWorkIdMock, setWorkSettings, getDefaults, listUserModels } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  resolutionMock: vi.fn(),
  activeWorkIdMock: vi.fn(),
  setWorkSettings: vi.fn(),
  getDefaults: vi.fn(),
  listUserModels: vi.fn(),
}));

vi.mock('@/auth', () => ({
  useAuth: () => useAuthMock(),
  useAuthOptional: () => ({ accessToken: useAuthMock() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/model-picker', () => ({ ModelPicker: () => null }));
vi.mock('@/features/settings/api', () => ({
  CHAT_CAPABILITY: 'chat',
  defaultModelsApi: { get: (...a: unknown[]) => getDefaults(...a) },
}));
vi.mock('../../hooks/useWork', () => ({
  useWorkResolution: () => resolutionMock(),
  useSetWorkSettings: (_bookId: string | undefined, _token: string | null) => ({
    mutateAsync: (vars: { projectId: string; currentSettings: Record<string, unknown>; patch: Record<string, unknown> }) =>
      setWorkSettings(vars),
  }),
}));
vi.mock('../../hooks/useActiveWork', () => ({ useActiveWorkId: () => activeWorkIdMock() }));

import { WorkDefaultModelPrompt } from '../WorkDefaultModelPrompt';

const BOOK = 'b-1';
const PROJECT = 'p-1';

function foundWork(settings: Record<string, unknown>) {
  return {
    status: 'found',
    work: {
      id: 'w-1',
      project_id: PROJECT,
      book_id: BOOK,
      kind: 'canonical',
      source_work_id: null,
      settings,
      status: 'active',
    },
  };
}

function model(id: string, name: string) {
  return {
    user_model_id: id,
    provider_kind: 'lm_studio',
    provider_model_name: name,
    alias: null,
    is_active: true,
    is_favorite: false,
    capability_flags: { chat: true },
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  useAuthMock.mockReset().mockReturnValue({ accessToken: 'tok', user: { user_id: 'u1' } });
  resolutionMock.mockReset();
  activeWorkIdMock.mockReset().mockReturnValue({ data: null });
  setWorkSettings.mockReset().mockResolvedValue({});
  getDefaults.mockReset().mockResolvedValue({ defaults: {} });
  listUserModels.mockReset().mockResolvedValue({
    items: [model('m-new', 'qwen3.8-27b'), model('m-chat', 'qwen3.6-35b-a3b')],
  });
});

describe('WorkDefaultModelPrompt (#facade — explicit-consent Work default)', () => {
  it('offers the account chat default when the Work has no chat model, and applies it on click', async () => {
    resolutionMock.mockReturnValue({
      data: foundWork({ source_language: 'ru' }), // no chat role — the reported shape
      isLoading: false,
    });
    getDefaults.mockResolvedValue({ defaults: { chat: 'm-new' } });

    render(<WorkDefaultModelPrompt bookId={BOOK} />);
    const apply = await screen.findByTestId('work-default-model-apply');
    expect(screen.getByTestId('work-default-model-prompt')).toBeInTheDocument();

    fireEvent.click(apply);
    await waitFor(() => expect(setWorkSettings).toHaveBeenCalledTimes(1));
    const vars = setWorkSettings.mock.calls[0][0];
    expect(vars.projectId).toBe(PROJECT);
    expect(vars.patch.model_roles.chat).toEqual({ model_ref: 'm-new', model_source: 'user_model' });
    // The rest of the settings blob survives the merge (source_language).
    expect(vars.currentSettings.source_language).toBe('ru');
  });

  it('does not offer when the Work already has a chat model', () => {
    resolutionMock.mockReturnValue({
      data: foundWork({ model_roles: { chat: { model_ref: 'm-chat', model_source: 'user_model' } } }),
      isLoading: false,
    });
    render(<WorkDefaultModelPrompt bookId={BOOK} />);
    expect(screen.queryByTestId('work-default-model-prompt')).toBeNull();
  });

  it('does not offer when the account has no chat default', () => {
    resolutionMock.mockReturnValue({ data: foundWork({ source_language: 'ru' }), isLoading: false });
    getDefaults.mockResolvedValue({ defaults: {} });
    render(<WorkDefaultModelPrompt bookId={BOOK} />);
    expect(screen.queryByTestId('work-default-model-prompt')).toBeNull();
  });

  it('dismiss suppresses the offer for this Work', async () => {
    resolutionMock.mockReturnValue({ data: foundWork({ source_language: 'ru' }), isLoading: false });
    getDefaults.mockResolvedValue({ defaults: { chat: 'm-new' } });
    render(<WorkDefaultModelPrompt bookId={BOOK} />);
    await screen.findByTestId('work-default-model-prompt');
    fireEvent.click(screen.getByTestId('work-default-model-dismiss'));
    expect(screen.queryByTestId('work-default-model-prompt')).toBeNull();
  });
});
