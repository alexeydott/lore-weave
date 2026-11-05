import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  changeLanguage: vi.fn(),
  savePrefToServer: vi.fn(),
  initializeI18n: vi.fn(),
  i18n: { language: 'en' },
}));

// Deliberately useTranslation-only, as in component suites that do not
// initialize i18next. A static uiLanguage import would request the missing
// initReactI18next export just by importing LanguageSelector.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: mocks.i18n.language, changeLanguage: mocks.changeLanguage },
  }),
}));
vi.mock('@/auth', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
vi.mock('@/lib/syncPrefs', () => ({
  savePrefToServer: mocks.savePrefToServer,
  loadPrefFromServer: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.doUnmock('@/i18n');
  mocks.i18n.language = 'en';
  mocks.changeLanguage.mockReset();
  mocks.savePrefToServer.mockReset().mockResolvedValue(true);
  mocks.initializeI18n.mockReset();
});

describe('LanguageSelector — lazy account language persistence', () => {
  it('imports and renders with a useTranslation-only mock without initializing i18next', async () => {
    // Leave the real initializer UNMOCKED here: importing it would fail on
    // initReactI18next, not silently succeed through a forgiving fake.
    const { LanguageSelector } = await import('../LanguageSelector');
    render(<LanguageSelector />);

    expect(screen.getByRole('button', { name: 'Русский' })).toBeInTheDocument();
    expect(mocks.changeLanguage).not.toHaveBeenCalled();
    expect(mocks.savePrefToServer).not.toHaveBeenCalled();
  });

  it('loads the persistence singleton only on selection and saves the selected language', async () => {
    // Instrument initialization on the action path without loading providers
    // or requiring the initializer's additional react-i18next exports.
    vi.doMock('@/i18n', () => {
      mocks.initializeI18n();
      return { default: mocks.i18n };
    });
    mocks.changeLanguage.mockImplementation((code: string) => {
      mocks.i18n.language = code;
      return Promise.resolve();
    });
    const { LanguageSelector } = await import('../LanguageSelector');
    render(<LanguageSelector />);
    expect(mocks.initializeI18n).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Русский' }));
    await waitFor(() => expect(mocks.savePrefToServer).toHaveBeenCalledWith('ui_language', 'ru', 'tok'));
    expect(mocks.changeLanguage).toHaveBeenCalledWith('ru');
    expect(mocks.initializeI18n).toHaveBeenCalledTimes(1);
  });
});
