// Visual-audit stories for the composition workspace panels (LOOM T5.4).
//
// The workspace (DockRail / DockSlot / FloatingWindow / ComponentPicker) had no
// stories, so its layout was only ever exercised through the full studio. These
// stories render each piece in isolation with placeholder panel content, at
// desktop and narrow widths, so layout glitches (rail overflow, floating-window
// stacking, picker-menu z-order) are visible in Storybook screenshots.
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within, waitFor } from 'storybook/test';
import { DockRail } from './DockRail';
import { DockSlot } from './DockSlot';
import { FloatingWindow } from './FloatingWindow';
import type { WorkspacePanelId } from '../../workspace/types';

const ALL_IDS: WorkspacePanelId[] = [
  'compose', 'cowriter', 'assemble', 'planner', 'beats', 'graph', 'cast', 'relmap',
  'timeline', 'arc', 'worldmap', 'grounding', 'canonview', 'references', 'style', 'canon', 'critic',
  'threads', 'progress', 'quality', 'polish', 'flywheel', 'motifs', 'conformance', 'settings',
];

function PanelBody({ id, lines = 6 }: { id: string; lines?: number }) {
  return (
    <div className="p-3 text-sm">
      <p className="font-medium">Panel: {id}</p>
      {Array.from({ length: lines }, (_, i) => (
        <p key={i} className="text-neutral-500">
          Line {i + 1} of placeholder content for the {id} panel.
        </p>
      ))}
    </div>
  );
}

const meta = {
  title: 'Composition/Workspace/Panels',
  parameters: {
    docs: {
      description: {
        component:
          'Dock rail, floating windows and dock slots of the composition workspace. ' +
          'Use the Narrow stories to check the rail overflow and the picker menu at phone width.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// Stateful rail wrapper: tab clicks, hide/show and reorder update local state,
// mirroring what CompositionPanel does with the layout dispatch.
function RailDemo({ initialHidden = [] as WorkspacePanelId[], width }: {
  initialHidden?: WorkspacePanelId[];
  width?: number;
}) {
  const [visible, setVisible] = useState<WorkspacePanelId[]>(
    ALL_IDS.filter((id) => !initialHidden.includes(id)),
  );
  const [hidden, setHidden] = useState<WorkspacePanelId[]>(initialHidden);
  const [active, setActive] = useState<WorkspacePanelId>('compose');
  const inner = (
    <div className="border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <DockRail
        visibleIds={visible}
        hiddenIds={hidden}
        active={active}
        onSelect={setActive}
        onReorder={setVisible}
        onHide={(id) => {
          setVisible((v) => v.filter((x) => x !== id));
          setHidden((h) => [...h, id]);
          if (active === id) setActive(visible.filter((x) => x !== id)[0] ?? 'compose');
        }}
        onShow={(id) => {
          setHidden((h) => h.filter((x) => x !== id));
          setVisible((v) => [...v, id]);
        }}
        onFloat={fn()}
        onPopout={fn()}
        rightSlot={
          <button type="button" className="ml-auto shrink-0 rounded px-2 py-0.5 text-xs text-neutral-500">
            ⛶ Power view
          </button>
        }
      />
      <div className="min-h-48 p-3 text-sm">
        <p className="font-medium">Active panel: {active}</p>
        <p className="text-neutral-500">Content area below the rail.</p>
      </div>
    </div>
  );
  return width ? <div style={{ width }}>{inner}</div> : inner;
}

// 1. Full rail — all 25 panels docked, nothing hidden (picker absent).
export const DockRailFull: Story = {
  render: () => <RailDemo />,
};

// 2. Rail with hidden panels — the "+" picker appears; play() opens its menu.
export const DockRailWithHidden: Story = {
  render: () => <RailDemo initialHidden={['threads', 'polish', 'flywheel', 'motifs']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const picker = await waitFor(() => canvas.getByTestId('dock-component-picker'));
    await userEvent.click(picker);
    await waitFor(() => canvas.getByTestId('dock-picker-menu'));
  },
};

// 3. Narrow rail — 375px wide, checks horizontal scrolling + picker reachability.
export const DockRailNarrow: Story = {
  render: () => <RailDemo width={375} />,
};

// 4. Narrow rail with hidden panels + open picker menu (menu is right-anchored).
export const DockRailNarrowWithHidden: Story = {
  render: () => <RailDemo initialHidden={['threads', 'polish', 'flywheel', 'motifs']} width={375} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const picker = await waitFor(() => canvas.getByTestId('dock-component-picker'));
    await userEvent.click(picker);
    await waitFor(() => canvas.getByTestId('dock-picker-menu'));
  },
};

// 5. One floating window at its default geometry.
export const FloatingWindowSingle: Story = {
  render: () => (
    <div className="relative h-[480px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <p className="p-3 text-sm text-neutral-500">Studio content behind the window.</p>
      <FloatingWindow
        title="cowriter"
        rect={{ x: 96, y: 96, w: 520, h: 420 }}
        zIndex={40}
        onMove={fn()}
        onResize={fn()}
        onDock={fn()}
      >
        <PanelBody id="cowriter" />
      </FloatingWindow>
    </div>
  ),
};

// 6. Two overlapping floating windows — checks z-order + header grip visibility.
export const FloatingWindowsOverlap: Story = {
  render: () => (
    <div className="relative h-[560px] border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <p className="p-3 text-sm text-neutral-500">Studio content behind the windows.</p>
      <FloatingWindow
        title="cowriter"
        rect={{ x: 96, y: 96, w: 520, h: 420 }}
        zIndex={40}
        onMove={fn()}
        onResize={fn()}
        onDock={fn()}
      >
        <PanelBody id="cowriter" />
      </FloatingWindow>
      <FloatingWindow
        title="assemble"
        rect={{ x: 220, y: 180, w: 520, h: 420 }}
        zIndex={41}
        onMove={fn()}
        onResize={fn()}
        onDock={fn()}
      >
        <PanelBody id="assemble" />
      </FloatingWindow>
    </div>
  ),
};

// 7. Rail + picker menu under a floating window — the menu (z-30) vs window (z-40)
// stacking check: the open menu must stay readable where the window overlaps it.
export const PickerMenuUnderFloatingWindow: Story = {
  render: () => (
    <div className="border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <RailDemo initialHidden={['threads', 'polish', 'flywheel', 'motifs']} />
      <FloatingWindow
        title="assemble"
        rect={{ x: 560, y: 0, w: 520, h: 420 }}
        zIndex={40}
        onMove={fn()}
        onResize={fn()}
        onDock={fn()}
      >
        <PanelBody id="assemble" />
      </FloatingWindow>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const picker = await waitFor(() => canvas.getByTestId('dock-component-picker'));
    await userEvent.click(picker);
    await waitFor(() => canvas.getByTestId('dock-picker-menu'));
  },
};

// 8. DockSlot docked: active panel visible, inactive hidden.
export const DockSlotDocked: Story = {
  render: () => (
    <div className="border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <DockSlot
        id="compose" active floated={false} rect={{ x: 96, y: 96, w: 520, h: 420 }}
        title="compose" zIndex={40} onMove={fn()} onResize={fn()} onDock={fn()}
      >
        <PanelBody id="compose (active — visible)" />
      </DockSlot>
      <DockSlot
        id="cowriter" active={false} floated={false} rect={{ x: 96, y: 96, w: 520, h: 420 }}
        title="cowriter" zIndex={40} onMove={fn()} onResize={fn()} onDock={fn()}
      >
        <PanelBody id="cowriter (inactive — must be hidden)" />
      </DockSlot>
    </div>
  ),
};
