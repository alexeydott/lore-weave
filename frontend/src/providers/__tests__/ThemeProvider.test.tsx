// Visual audit 2026-11-13 (V2): tailwind is configured with
// `darkMode: 'class'`, so every `dark:` utility is dead unless something
// adds the `.dark` class. ThemeProvider only toggled `data-theme` (which
// switches the CSS variables but not the `dark:` variant), so in the
// default dark theme panels stayed `bg-white` while `--foreground` was
// near-white — foreground text was invisible.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useAppTheme, type AppTheme } from '../ThemeProvider';

function TestConsumer() {
  const { appTheme, setAppTheme } = useAppTheme();
  return (
    <div>
      <span data-testid="theme">{appTheme}</span>
      <button onClick={() => setAppTheme('light')}>light</button>
      <button onClick={() => setAppTheme('sepia')}>sepia</button>
      <button onClick={() => setAppTheme('oled')}>oled</button>
      <button onClick={() => setAppTheme('dark')}>dark</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <TestConsumer />
    </ThemeProvider>,
  );
}

describe('ThemeProvider .dark class', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
  });

  it('adds .dark for the default dark theme', () => {
    renderProvider();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('removes .dark and sets data-theme for light', () => {
    renderProvider();
    act(() => {
      screen.getByText('light').click();
    });
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('removes .dark and sets data-theme for sepia', () => {
    renderProvider();
    act(() => {
      screen.getByText('sepia').click();
    });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('sepia');
  });

  it('keeps .dark and sets data-theme for oled', () => {
    renderProvider();
    act(() => {
      screen.getByText('oled').click();
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('oled');
  });

  it('loads a saved light theme without .dark', () => {
    localStorage.setItem('lw_theme_prefs', JSON.stringify({ app_theme: 'light' as AppTheme }));
    renderProvider();
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
