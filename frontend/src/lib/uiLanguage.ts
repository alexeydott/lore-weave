import { UI_LOCALES } from '@/lib/languages';
import { loadPrefFromServer, savePrefToServer } from '@/lib/syncPrefs';

// i18n is imported LAZILY: a static import here would pull the real i18next
// initializer into every test that (directly or transitively) imports this
// module — breaking suites whose react-i18next mock defines only the pieces
// the components under test use (measured: 14 suites, "No initReactI18next
// export on the react-i18next mock"). Dynamic import resolves to the same
// singleton at runtime; test mocks of '@/i18n' keep working.
async function getI18n() {
  return (await import('@/i18n')).default;
}

/**
 * Server-side persistence for the UI language.
 *
 * The i18next detector keeps the choice in localStorage (`lw_language`), which
 * is lost on a cleared browser / another device — and with it the whole
 * localization ("полностью пропала русская локализация", 2026-10-25). The
 * account preference `ui_language` in auth-service's user_preferences is the
 * durable copy: applied at app bootstrap (overriding the device default —
 * the server is the source of truth for a logged-in user), written on every
 * change. localStorage stays the fast path and the logged-out store.
 */

/** The stored code is a registry UI locale (base-code match: ru-RU → ru). */
function isSupported(code: string): boolean {
  return UI_LOCALES.some((l) => code === l || code.startsWith(`${l}-`));
}

/** Applies the current i18n language to the account, fire-and-forget. */
export function persistUiLanguage(token: string | null | undefined): void {
  void (async () => {
    const code = (await getI18n()).language;
    if (!code) return;
    await savePrefToServer('ui_language', code, token);
  })();
}

/**
 * Applies the account's stored `ui_language` (if any) on bootstrap. Runs once
 * per token; safe to call from a top-level effect after auth resolves.
 */
let appliedForToken: string | null = null;
export async function applyAccountLanguage(token: string | null | undefined): Promise<void> {
  if (!token || appliedForToken === token) return;
  appliedForToken = token;
  const i18n = await getI18n();
  const stored = await loadPrefFromServer<string>('ui_language', token);
  if (!stored || !isSupported(stored)) return;
  // Base-code compare: 'ru' should not re-apply over the equivalent 'ru-RU'.
  const current = i18n.language;
  const sameLanguage = current === stored || current.startsWith(`${stored}-`);
  if (!sameLanguage && i18n.language !== stored) {
    await i18n.changeLanguage(stored);
  }
}
