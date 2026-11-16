import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, RequireAuth } from '@/auth';
// W0-S16 — the QueryClient now carries a global MutationCache.onError (see lib/queryClient.ts).
import { queryClient } from '@/lib/queryClient';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { FullBleedLayout } from '@/layouts/FullBleedLayout';
import { EditorLayout } from '@/layouts/EditorLayout';
import { ChatLayout } from '@/layouts/ChatLayout';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { useAuth } from '@/auth';
import { SidebarProvider } from '@/providers/SidebarProvider';
import { PlatformHomePage } from '@/features/home/components/PlatformHomePage';
import { ActivityPage } from '@/features/home/components/ActivityPage';
import { YouPage } from '@/features/home/components/YouPage';
import { UpdatePrompt } from '@/pwa/UpdatePrompt';
import { MobileNav } from '@/app/shell/MobileNav';
import { GlobalOperationProgress } from '@/components/shared/GlobalOperationProgress';
import { lazy, Suspense, useEffect } from 'react';
import { applyAccountLanguage } from '@/lib/uiLanguage';

const BooksPage = lazy(() => import('@/pages/BooksPage').then((module) => ({ default: module.BooksPage })));
const TrashPage = lazy(() => import('@/pages/TrashPage').then((module) => ({ default: module.TrashPage })));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const ForgotPage = lazy(() => import('@/pages/auth/ForgotPage').then((module) => ({ default: module.ForgotPage })));
const ResetPage = lazy(() => import('@/pages/auth/ResetPage').then((module) => ({ default: module.ResetPage })));
const VerifyPage = lazy(() => import('@/pages/auth/VerifyPage').then((module) => ({ default: module.VerifyPage })));
const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })));
const WorldsPage = lazy(() => import('@/features/world/pages/WorldsPage').then((module) => ({ default: module.WorldsPage })));
const CampaignsPage = lazy(() => import('@/features/campaigns/pages/CampaignsPage').then((module) => ({ default: module.CampaignsPage })));
const JobsPage = lazy(() => import('@/features/jobs/pages/JobsPage').then((module) => ({ default: module.JobsPage })));
const JobDetailPage = lazy(() => import('@/features/jobs/pages/JobDetailPage').then((module) => ({ default: module.JobDetailPage })));
const BrowsePage = lazy(() => import('@/pages/BrowsePage').then((module) => ({ default: module.BrowsePage })));
const PublicBookDetailPage = lazy(() => import('@/pages/PublicBookDetailPage').then((module) => ({ default: module.PublicBookDetailPage })));
const SharedBookPage = lazy(() => import('@/pages/SharedBookPage').then((module) => ({ default: module.SharedBookPage })));
const ReadingHistoryPage = lazy(() => import('@/pages/ReadingHistoryPage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage').then((module) => ({ default: module.LeaderboardPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })));
const RawSearchPage = lazy(() => import('@/pages/RawSearchPage').then((module) => ({ default: module.RawSearchPage })));
const OnboardingPage = lazy(() => import('@/features/onboarding/pages/OnboardingPage').then((module) => ({ default: module.OnboardingPage })));
const OAuthConsentPage = lazy(() => import('@/pages/OAuthConsentPage').then((module) => ({ default: module.OAuthConsentPage })));
const ChatPage = lazy(() => import('@/pages/ChatPage').then((module) => ({ default: module.ChatPage })));
const AssistantPage = lazy(() => import('@/features/assistant/components/AssistantPage').then((module) => ({ default: module.AssistantPage })));
const RoleplayPage = lazy(() => import('@/features/roleplay/pages/RoleplayPage').then((module) => ({ default: module.RoleplayPage })));
const BookDetailPage = lazy(() => import('@/pages/BookDetailPage').then((module) => ({ default: module.BookDetailPage })));
const ChapterEditorPage = lazy(() => import('@/pages/ChapterEditorPage').then((module) => ({ default: module.ChapterEditorPage })));
const WritingStudioPage = lazy(() => import('@/pages/WritingStudioPage').then((module) => ({ default: module.WritingStudioPage })));
const PopoutHost = lazy(() => import('@/features/composition/components/workspace/PopoutHost').then((module) => ({ default: module.PopoutHost })));
const StudioPopoutHost = lazy(() => import('@/features/studio/popout/StudioPopoutHost').then((module) => ({ default: module.StudioPopoutHost })));
const ChapterComparePage = lazy(() => import('@/pages/ChapterComparePage').then((module) => ({ default: module.ChapterComparePage })));
const WikiEditorPage = lazy(() => import('@/pages/WikiEditorPage').then((module) => ({ default: module.WikiEditorPage })));
const ReaderPage = lazy(() => import('@/pages/ReaderPage').then((module) => ({ default: module.ReaderPage })));
const UsagePage = lazy(() => import('@/pages/UsagePage').then((module) => ({ default: module.UsagePage })));
const KnowledgePage = lazy(() => import('@/pages/KnowledgePage').then((module) => ({ default: module.KnowledgePage })));
const ExtensionsPage = lazy(() => import('@/features/extensions/pages/ExtensionsPage').then((module) => ({ default: module.ExtensionsPage })));
const ProjectDetailShell = lazy(() => import('@/pages/ProjectDetailShell').then((module) => ({ default: module.ProjectDetailShell })));
const WorldWorkspacePage = lazy(() => import('@/features/world/pages/WorldWorkspacePage').then((module) => ({ default: module.WorldWorkspacePage })));
const CreateCampaignWizardPage = lazy(() => import('@/features/campaigns/pages/CreateCampaignWizardPage').then((module) => ({ default: module.CreateCampaignWizardPage })));
const CampaignDetailPage = lazy(() => import('@/features/campaigns/pages/CampaignDetailPage').then((module) => ({ default: module.CampaignDetailPage })));
const StandardsPage = lazy(() => import('@/features/standards/pages/StandardsPage').then((module) => ({ default: module.StandardsPage })));
const ContextInspectorPage = lazy(() => import('@/features/chat/inspector/ContextInspectorPage').then((module) => ({ default: module.ContextInspectorPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const ChapterTranslationsPage = lazy(() => import('@/pages/ChapterTranslationsPage').then((module) => ({ default: module.ChapterTranslationsPage })));
const TranslationReviewPage = lazy(() => import('@/pages/TranslationReviewPage'));

function AuthenticatedThemeProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  return <ThemeProvider accessToken={accessToken}>{children}</ThemeProvider>;
}

/**
 * Restores the account's UI language at bootstrap (ui_language in
 * /v1/me/preferences). The device copy — i18next's localStorage cache — dies
 * with a cleared browser, a new device, or an app re-install; without this the
 * whole localization silently fell back to English ("полностью пропала русская
 * локализация", 2026-10-25). Written on every change by LanguageSelector and
 * the settings LanguageTab.
 */
function UiLanguageSync() {
  const { accessToken } = useAuth();
  useEffect(() => {
    void applyAccountLanguage(accessToken);
  }, [accessToken]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <UiLanguageSync />
    <AuthenticatedThemeProvider>
    <SidebarProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Toaster position="bottom-right" richColors closeButton />
        <GlobalOperationProgress />
        <UpdatePrompt />
        {/* The always-visible mobile bottom navigator (fixed; every app screen). */}
        <MobileNav />
        <Suspense fallback={<div role="status" aria-label="Loading page" />}>
        <Routes>
          {/* ── Public routes (no auth required) ── */}

          {/* Landing / home */}
          <Route path="/" element={<HomePage />} />

          {/* Auth pages (centered, no sidebar) */}
          <Route element={<FullBleedLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot" element={<ForgotPage />} />
            <Route path="/reset" element={<ResetPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            {/* P5 public-MCP OAuth consent — the page handles auth itself (preserves
                the query string across the login round-trip), so it's NOT in RequireAuth. */}
            <Route path="/oauth/consent" element={<OAuthConsentPage />} />
          </Route>

          {/* Public pages with sidebar — no auth required */}
          <Route element={<DashboardLayout />}>
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/browse/:bookId" element={<PublicBookDetailPage />} />
            <Route path="/reading-history" element={<ReadingHistoryPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/users/:userId" element={<ProfilePage />} />
          </Route>

          {/* Reader — full screen, no sidebar */}
          <Route path="/books/:bookId/chapters/:chapterId/read" element={<ReaderPage />} />

          {/* T5.4 M4 — composition panel OS pop-out window (own root, full-screen, auth) */}
          <Route path="/composition/popout" element={<RequireAuth><PopoutHost /></RequireAuth>} />

          {/* #16 2.8 — Studio Compose panel OS pop-out window (own root, full-screen, auth) */}
          <Route path="/studio/popout" element={<RequireAuth><StudioPopoutHost /></RequireAuth>} />

          {/* Translation review — full screen, auth required */}
          <Route path="/books/:bookId/chapters/:chapterId/review/:versionId" element={<RequireAuth><TranslationReviewPage /></RequireAuth>} />

          {/* Writing Studio (v2) — book-level VS Code-style docking workspace (dockview).
              Full screen, auth required — deliberately NOT under EditorLayout: the studio has
              its own Activity Bar chrome, so the app sidebar would be a redundant second rail. */}
          <Route path="/books/:bookId/studio" element={<RequireAuth><WritingStudioPage /></RequireAuth>} />

          {/* Public reader — unlisted/public books readable without login */}
          <Route element={<FullBleedLayout />}>
            <Route path="/s/:accessToken" element={<SharedBookPage />} />
          </Route>

          {/* ── Protected routes (auth required) ── */}

          {/* Editor (collapsed sidebar) */}
          <Route element={<RequireAuth><EditorLayout /></RequireAuth>}>
            <Route path="/books/:bookId/chapters/:chapterId/edit" element={<ChapterEditorPage />} />
            <Route path="/books/:bookId/chapters/:chapterId/compare" element={<ChapterComparePage />} />
            <Route path="/books/:bookId/chapters/:chapterId/translations" element={<ChapterTranslationsPage />} />
            <Route path="/books/:bookId/wiki/:articleId/edit" element={<WikiEditorPage />} />
          </Route>

          {/* Chat (app sidebar + full-bleed content, no padding) */}
          <Route element={<RequireAuth><ChatLayout /></RequireAuth>}>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:sessionId" element={<ChatPage />} />
            {/* WS-1.10 — the Work Assistant: reuses the chat surface + a home strip,
                bound to the user's private diary book. Same layout chrome as chat. */}
            <Route path="/assistant" element={<AssistantPage />} />
            {/* Roleplay practice — reuses the chat turn loop + voice; scripts +
                start come from roleplay-service (/v1/roleplay). Interview is a
                preset genre. /interview redirects (kept for old links). */}
            <Route path="/roleplay" element={<RoleplayPage />} />
            <Route path="/interview" element={<Navigate to="/roleplay" replace />} />
          </Route>

          {/* Dashboard pages (full sidebar) */}
          <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            {/* C22 — first-run intent fork. /onboarding is the gate (shows the
                fork only on first run, else redirects to /books); /onboarding/new
                is the re-entry "start something new" affordance (always shows). */}
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/onboarding/new" element={<OnboardingPage forceShow />} />

            {/* Mobile bottom-tab targets. /home + /activity are M2 (the platform home + feed);
                /you is the M3 placeholder for now. Real routes on desktop too. */}
            <Route path="/home" element={<PlatformHomePage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/you" element={<YouPage />} />

            {/* Workspace */}
            <Route path="/books" element={<BooksPage />} />
            <Route path="/trash" element={<TrashPage />} />
            <Route path="/books/:bookId" element={<BookDetailPage />} />
            <Route path="/books/:bookId/translation" element={<BookDetailPage />} />
            <Route path="/books/:bookId/glossary" element={<BookDetailPage />} />
            <Route path="/books/:bookId/kg-ontology" element={<BookDetailPage />} />
            <Route path="/books/:bookId/enrichment" element={<BookDetailPage />} />
            <Route path="/books/:bookId/sharing" element={<BookDetailPage />} />
            <Route path="/books/:bookId/settings" element={<BookDetailPage />} />
            <Route path="/books/:bookId/wiki" element={<BookDetailPage />} />
            <Route path="/books/:bookId/search" element={<RawSearchPage />} />

            {/* Chat — placeholder removed, see FullBleedLayout below */}

            {/* Knowledge Service */}
            <Route path="/knowledge" element={<Navigate to="/knowledge/projects" replace />} />
            {/* C6 (G6) — project-detail shell. The 4-segment nested route is
                more specific than the 2-segment flat-tab route below, so it
                wins; they don't conflict. */}
            <Route
              path="/knowledge/projects/:projectId/:section"
              element={<ProjectDetailShell />}
            />
            <Route path="/knowledge/:tab" element={<KnowledgePage />} />

            {/* C21 — World container (prose-less worldbuilding). HOME browser +
                workspace shell; no manuscript. */}
            <Route path="/worlds" element={<WorldsPage />} />
            <Route path="/worlds/:worldId" element={<WorldWorkspacePage />} />

            {/* Campaigns (extraction + translation batches) */}
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/new" element={<CreateCampaignWizardPage />} />
            <Route path="/campaigns/:campaignId" element={<CampaignDetailPage />} />

            {/* Unified Jobs control plane (P4) — every background job the user owns. */}
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:service/:jobId" element={<JobDetailPage />} />

            {/* Manage */}
            <Route path="/usage" element={<UsagePage />} />

            {/* Context Budget Law §11 — the Context Compiler · Trace Inspector,
                standalone (also a dockable studio panel). */}
            <Route path="/context-inspector" element={<ContextInspectorPage />} />

            {/* Glossary standards library (per-user, tier-scoped) */}
            <Route path="/standards" element={<Navigate to="/standards/genres" replace />} />
            <Route path="/standards/:tab" element={<StandardsPage />} />

            {/* Settings */}
            <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
            <Route path="/settings/:tab" element={<SettingsPage />} />

            {/* Notifications */}
            <Route path="/notifications" element={<NotificationsPage />} />

            {/* Agent Extensibility Registry — plugins/skills/proposals (two-shells
                with the studio ExtensionsPanel) */}
            <Route path="/extensions" element={<ExtensionsPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<FullBleedLayout />}>
            <Route path="*" element={<PlaceholderPage title="404" description="Page not found." />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </SidebarProvider>
    </AuthenticatedThemeProvider>
    </AuthProvider>
    </QueryClientProvider>
  );
}
