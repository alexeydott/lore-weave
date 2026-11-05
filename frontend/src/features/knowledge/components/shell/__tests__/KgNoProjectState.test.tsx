// D-KG-NO-CREATE-CTA: the shared "no KG project for this book" empty state — every
// book-scoped kg-* panel's dead-end ("...create a project to manage its graph schema"
// with no button behind it) now has a real create action. Reuses ProjectFormModal AS-IS
// (DOCK-2) with initialBookId locking the picker to this book.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/auth', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMocks }));

// Keep this form regression offline, including its background reads.
vi.mock('@/features/chat-ai-settings/hooks/useChatCapabilities', () => ({
  useChatCapabilities: () => ({ capabilities: null, loading: false }),
}));

const createProjectApi = vi.fn();
vi.mock('@/features/knowledge/api', () => ({
  knowledgeApi: {
    listProjects: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createProject: (...a: unknown[]) => createProjectApi(...a),
  },
  isVersionConflict: () => false,
}));

import { KgNoProjectState } from '../KgNoProjectState';

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  createProjectApi.mockReset();
  Object.values(toastMocks).forEach((mock) => mock.mockReset());
});

describe('KgNoProjectState', () => {
  it('renders the no-project copy under the caller-supplied testId', () => {
    renderWithProviders(<KgNoProjectState bookId="11111111-1111-1111-1111-111111111111" testId="kg-overview-no-project" />);
    const el = screen.getByTestId('kg-overview-no-project');
    expect(el).toHaveTextContent('page.noProject');
    expect(el).toHaveTextContent('page.noProjectHelp');
  });

  it('opens the create-project form on button click', () => {
    renderWithProviders(<KgNoProjectState bookId="11111111-1111-1111-1111-111111111111" testId="kg-overview-no-project" />);
    fireEvent.click(screen.getByTestId('kg-no-project-create-btn'));
    // The book-picker field is locked (not the free-text BookPicker) — proves
    // initialBookId reached ProjectFormModal instead of leaving book selection open.
    expect(screen.getByTestId('project-form-book-locked')).toBeInTheDocument();
  });

  it('submitting the form creates a project scoped to this book (locked, not the free BookPicker)', async () => {
    createProjectApi.mockResolvedValue({
      project_id: 'new-proj',
      name: 'My Book KG',
      project_type: 'book',
      book_id: '11111111-1111-1111-1111-111111111111',
    });
    renderWithProviders(<KgNoProjectState bookId="11111111-1111-1111-1111-111111111111" testId="kg-overview-no-project" />);
    fireEvent.click(screen.getByTestId('kg-no-project-create-btn'));

    const nameInput = screen.getByPlaceholderText('projects.form.namePlaceholder');
    fireEvent.change(nameInput, { target: { value: 'My Book KG' } });

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('projects.form.create'));

    // API invocation is not completion: a rejected onSuccess callback used to
    // leave all assertions green while Vitest reported an unhandled rejection.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastMocks.success).toHaveBeenCalledWith('projects.toast.created');
    expect(toastMocks.info).not.toHaveBeenCalled();
    expect(toastMocks.error).not.toHaveBeenCalled();
    expect(createProjectApi).toHaveBeenCalledTimes(1);
    const [payload] = createProjectApi.mock.calls[0]!;
    expect(payload).toMatchObject({ name: 'My Book KG', project_type: 'book', book_id: '11111111-1111-1111-1111-111111111111' });
  });

  it('surfaces a rejected create, keeps the form open, and permits a successful retry', async () => {
    createProjectApi.mockRejectedValueOnce(new Error('Project save failed'));
    renderWithProviders(<KgNoProjectState bookId="11111111-1111-1111-1111-111111111111" testId="kg-overview-no-project" />);
    fireEvent.click(screen.getByTestId('kg-no-project-create-btn'));
    const nameInput = screen.getByPlaceholderText('projects.form.namePlaceholder');
    fireEvent.change(nameInput, { target: { value: 'My Book KG' } });
    const submit = within(screen.getByRole('dialog')).getByText('projects.form.create');
    fireEvent.click(submit);

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith('Project save failed');
      expect(submit).toBeEnabled();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(nameInput).toHaveValue('My Book KG');
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(toastMocks.info).not.toHaveBeenCalled();

    createProjectApi.mockResolvedValueOnce({
      project_id: 'new-proj',
      name: 'My Book KG',
      project_type: 'book',
      book_id: '11111111-1111-1111-1111-111111111111',
    });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastMocks.success).toHaveBeenCalledWith('projects.toast.created');
    expect(createProjectApi).toHaveBeenCalledTimes(2);
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
  });
});
