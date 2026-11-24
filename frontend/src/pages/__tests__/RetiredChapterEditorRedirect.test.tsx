import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RetiredChapterEditorRedirect } from '../RetiredChapterEditorRedirect';

// The legacy chapter editor is RETIRED (PO, 2026-09-18): the Writing Studio is the only writing
// surface. Its route survives only as a redirect, and nothing in the app may link to it again.
//
// FORK (2026-11-24): the retirement itself has NOT landed on this tree — `ChapterEditorPage.tsx`
// is still the writing surface behind the legacy route, and its deletion stays blocked on
// `D-STUDIO-MOBILE-SHELL` (MASTER-IMPL §4.2: "a green gate ≠ an authorization to delete"). While
// the page exists it legitimately links into its own route, so the no-links guard below is
// ARMED but SKIPPED via `it.skipIf`: the day the page is deleted the guard wakes on its own.

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

/** True once the retirement has actually landed: the legacy page file is gone. */
function isRetired(): boolean {
  return !existsSync(join(__dirname, '..', '..', 'pages', 'ChapterEditorPage.tsx'));
}

describe('the retired chapter editor route', () => {
  it('sends /books/:bookId/chapters/:chapterId/edit to the same chapter in the Writing Studio', () => {
    render(
      <MemoryRouter initialEntries={['/books/b-1/chapters/c-9/edit']}>
        <Routes>
          <Route path="/books/:bookId/chapters/:chapterId/edit" element={<RetiredChapterEditorRedirect />} />
          <Route path="/books/:bookId/studio" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where').textContent).toBe('/books/b-1/studio?chapter=c-9');
  });

  // Armed only once the retirement has actually landed (the page file deleted). While the
  // page exists its own chapter-switch navigation is a legitimate self-link.
  it.skipIf(!isRetired())('no source file builds a link to the retired editor path', () => {
    const root = join(__dirname, '..', '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== '__tests__' && name !== 'node_modules') walk(p);
        } else if (/\.(tsx?|jsx?)$/.test(name)) {
          const src = readFileSync(p, 'utf8');
          // a navigation target: `/books/${...}/chapters/${...}/edit` in a template literal
          if (/\/books\/\$\{[^}]+\}\/chapters\/\$\{[^}]+\}\/edit/.test(src)) offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders, 'these still link into the retired chapter editor — use studioChapterPath').toEqual([]);
  });
});
