// Writing Studio (v2) — shared types.

/** The primary navigators the Activity Bar switches the Side Bar between. */
export type ActivityView = 'manuscript' | 'plan' | 'bible' | 'search' | 'quality';

// 24 PH25 — `plan` sits next to `manuscript`: they are the two densities of the book (the spec
// tree and the prose spine), and the rail's click contract distinguishes them (plan → the Hub
// canvas; manuscript → the Editor).
export const ACTIVITY_VIEWS: readonly ActivityView[] = ['manuscript', 'plan', 'bible', 'search', 'quality'];

/** Per-book, per-device chrome UI state (which navigator, collapses, sidebar width). Persisted
 * separately from the dockview layout so frame state and dock state can't corrupt each other. */
export interface StudioChromeState {
  activeView: ActivityView;
  sidebarCollapsed: boolean;
  bottomOpen: boolean;
  /** Side Bar width in px (per-device UI state → localStorage). Resizable like a dock panel. */
  sidebarWidth: number;
  /** Bottom panel height in px (per-device UI state → localStorage). Draggable sash on the
   *  panel's top edge, VS Code "panel" behaviour (#user-report 2026-11-28). */
  bottomHeight: number;
}

/** Side Bar width bounds. Min keeps the navigator readable; max stops it eating an ultrawide
 * dock. Default matches the old fixed `w-[250px]` neighbourhood, a touch wider for the new handle. */
export const SIDEBAR_WIDTH_DEFAULT = 260;
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 640;

/** Clamp + round a proposed sidebar width to the allowed range. Pure — unit-tested. */
export function clampSidebarWidth(w: number): number {
  if (!Number.isFinite(w)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, Math.round(w)));
}

/** Bottom panel height bounds + default (the old fixed 168px, one notch taller now that
 *  the panel carries a real feed). */
export const BOTTOM_HEIGHT_DEFAULT = 200;
export const BOTTOM_HEIGHT_MIN = 120;
export const BOTTOM_HEIGHT_MAX = 520;

/** Clamp + round a proposed bottom-panel height to the allowed range. Pure — unit-tested. */
export function clampBottomHeight(height: number): number {
  return Math.min(BOTTOM_HEIGHT_MAX, Math.max(BOTTOM_HEIGHT_MIN, Math.round(height)));
}

export const DEFAULT_CHROME: StudioChromeState = {
  activeView: 'manuscript',
  sidebarCollapsed: false,
  bottomOpen: false,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  bottomHeight: BOTTOM_HEIGHT_DEFAULT,
};
