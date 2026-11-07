import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ContextPicker } from '../ContextPicker';
import type { ContextItem } from '../types';

// The picker reads the session binding + the editor's open chapter from the
// two chat providers, and the catalog from useContextCandidates — all mocked.
const BOOK = '019fce4a-0664-76c5-b061-28287bf2c088';
const OTHER = 'aaaaaaaa-1111-2222-3333-444444444444';

const mockSession = { activeSession: { session_id: 's1', book_id: BOOK }, sessions: [], sessionsLoading: false };
const mockStream = { editorContext: { book_id: BOOK, chapter_id: 'chap-active-1' } };

vi.mock('../../providers/ChatSessionContext', () => ({
  useChatSession: () => mockSession,
}));
vi.mock('../../providers/ChatStreamContext', () => ({
  useChatStreamOptional: () => mockStream,
}));
vi.mock('@/features/glossary/hooks/useEntityKinds', () => ({
  useEntityKinds: () => ({ kinds: [] }),
}));
vi.mock('../../hooks/useContextCandidates', () => ({
  useContextCandidates: () => ({
    books: [
      { book_id: BOOK, title: 'Здравствуй, новый дивный мир', chapter_count: 30 },
      { book_id: OTHER, title: 'Другая книга', chapter_count: 3 },
    ],
    chapters: [
      { chapter_id: 'chap-active-1', book_id: BOOK, bookTitle: 'Здравствуй', title: 'Активная глава', byte_size: 500 },
      { chapter_id: 'chap-other', book_id: OTHER, bookTitle: 'Другая книга', title: 'Чужая глава', byte_size: 500 },
    ],
    entities: [
      { entity_id: 'e1', book_id: BOOK, display_name: 'Вэнь Кэсин', kind: { name: 'Character', color: '#aabbcc' } },
      { entity_id: 'e2', book_id: BOOK, display_name: 'Чжоу Цзышу', kind: { name: 'Character', color: '#aabbcc' } },
      { entity_id: 'e3', book_id: OTHER, display_name: 'Чужая сущность', kind: { name: 'Character', color: '#aabbcc' } },
    ],
  }),
}));

describe('ContextPicker — book-bound auto-attach (#user-report 2026-11-07)', () => {
  beforeEach(() => {
    mockSession.activeSession = { session_id: 's1', book_id: BOOK };
  });

  it('pre-attaches the session book, its glossary entities, and the active chapter', () => {
    const attached: ContextItem[] = [];
    render(
      <ContextPicker
        attached={[]}
        onAttach={(item) => attached.push(item)}
        onDetach={() => {}}
        onClose={() => {}}
      />,
    );
    const ids = attached.map((a) => a.id);
    expect(ids).toContain(BOOK);            // the book entry
    expect(ids).toContain('chap-active-1'); // the editor's ACTIVE chapter
    expect(ids).toContain('e1');            // the book's glossary entities
    expect(ids).toContain('e2');
    // Nothing from OTHER books
    expect(ids).not.toContain('chap-other');
    expect(ids).not.toContain('e3');
  });

  it('attaches nothing when the session is not book-bound (global chat)', () => {
    mockSession.activeSession = { session_id: 's1', book_id: null } as never;
    const attached: ContextItem[] = [];
    render(
      <ContextPicker
        attached={[]}
        onAttach={(item) => attached.push(item)}
        onDetach={() => {}}
        onClose={() => {}}
      />,
    );
    expect(attached).toHaveLength(0);
  });

  it('does not re-attach on re-render (one-shot per dialog open)', () => {
    const attached: ContextItem[] = [];
    const { rerender } = render(
      <ContextPicker
        attached={[]}
        onAttach={(item) => attached.push(item)}
        onDetach={() => {}}
        onClose={() => {}}
      />,
    );
    const countAfterMount = attached.length;
    expect(countAfterMount).toBeGreaterThan(0);
    rerender(
      <ContextPicker
        attached={[...attached]}
        onAttach={(item) => attached.push(item)}
        onDetach={() => {}}
        onClose={() => {}}
      />,
    );
    expect(attached.length).toBe(countAfterMount);
  });
});
