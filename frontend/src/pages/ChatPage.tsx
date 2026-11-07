import { useEffect, useRef } from 'react';
import { ChatSessionProvider, ChatStreamProvider, useChatSession } from '@/features/chat/providers';
import { SessionSidebar } from '@/features/chat/components/SessionSidebar';
import { ChatView } from '@/features/chat/components/ChatView';
import { NewChatDialog } from '@/features/chat/components/NewChatDialog';
import { ChatKeyboardShortcuts } from '@/features/chat/components/ChatKeyboardShortcuts';
import { ChatEmptyState } from '@/features/chat/components/ChatEmptyState';

export function ChatPage() {
  return (
    <ChatSessionProvider>
      <ChatStreamProvider>
        <ChatPageLayout />
      </ChatStreamProvider>
    </ChatSessionProvider>
  );
}

/** Inner layout — reads from context providers */
function ChatPageLayout() {
  const {
    activeSession,
    sessions,
    sessionsLoading,
    modelNameMap,
    selectSession,
    renameSession,
    archiveSession,
    deleteSession,
    togglePin,
    showNewDialog,
    setShowNewDialog,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    createSession,
  } = useChatSession();

  // #user-report 2026-11-07 — /chat landed on the «Чат не выбран» empty state
  // even when sessions existed: a dead end forcing a manual click on every
  // visit. Auto-select the most recent session once the list loads (the list
  // is newest-first). Direct /chat/:sessionId links are unaffected — the
  // session context resolves the URL param before this matters.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current || sessionsLoading || activeSession) return;
    // Wait for the list BEFORE arming the one-shot: the flag must not burn on
    // an early render where loading is still false but sessions haven't arrived.
    if (!sessions.length) return;
    autoSelectedRef.current = true;
    selectSession(sessions[0]);
  }, [sessions, sessionsLoading, activeSession, selectSession]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <ChatKeyboardShortcuts />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSession?.session_id ?? null}
          isLoading={sessionsLoading}
          modelNameMap={modelNameMap}
          onSelect={selectSession}
          onCreate={() => { setShowNewDialog(true); setMobileSidebarOpen(false); }}
          onRename={renameSession}
          onArchive={archiveSession}
          onDelete={deleteSession}
          onTogglePin={(sessionId, pinned) => void togglePin(sessionId, pinned)}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* ChatView always mounted — never unmounts voice/audio state */}
          <ChatView className={!activeSession ? 'hidden' : ''} />
          <ChatEmptyState className={activeSession ? 'hidden' : ''} />
        </div>
      </div>

      <NewChatDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreate={(modelRef, systemPrompt) => {
          void createSession({
            model_source: 'user_model',
            model_ref: modelRef,
            title: 'New Chat',
            system_prompt: systemPrompt,
          });
        }}
      />
    </div>
  );
}
