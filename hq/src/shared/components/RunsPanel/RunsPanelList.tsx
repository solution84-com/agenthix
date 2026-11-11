import { useCallback, useMemo } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { Link, useNavigate } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import type { MyRun } from '../../../runs/queries'
import { useShellPanels } from '../../context/useShellPanels'
import { useIsMobile } from '../../hooks/useIsMobile'
import { TOP_BAR_BUTTON, TopBar, TopBarTitle } from '../../layouts/TopBar'
import type { PhoneAction } from '../../layouts/phoneActions'
import { PanelHead } from '../NotificationPanel/PanelHead'
import { RunsListView } from './RunsListView'

/**
 * The Runs panel (the Runs panel design): the person's own runs across every project, what needs them first, in the
 * Workroom's four groups. A click on a run opens its task or conversation; a tap on one asking for an okay opens its
 * request in the panel. Open Workrooms › is the live view across projects; All runs › the history. On a phone the
 * panel is a screen of its own, under the shared top bar: ‹ Back out of it, its title, the chat, and Open Workrooms ›
 * in its ⋯.
 */
export function RunsPanelList({ onOpenRequest }: { onOpenRequest: (taskKey: string) => void }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { close } = useShellPanels()
  // Leaving the page closes the panel: its state is in the URL being replaced.
  const open = useCallback((run: MyRun) => navigate(run.href), [navigate])
  const phoneActions = useMemo<PhoneAction[]>(() => [{ label: 'Open Workrooms ›', onSelect: () => navigate('/workrooms') }], [navigate])

  return (
    <div className="flex flex-col h-full">
      {isMobile ? (
        <TopBar
          withScreenActions={false} actions={phoneActions}
          leading={<button type="button" onClick={close} aria-label="Back" className={TOP_BAR_BUTTON}><ChevronLeft size={18} aria-hidden /></button>}
        >
          <TopBarTitle title="Runs" under="Yours, in every project" />
        </TopBar>
      ) : (
        <PanelHead
          title="Runs"
          action={<Link to="/workrooms" className={`rounded text-small text-link hover:underline ${FOCUS_RING}`}>Open Workrooms ›</Link>}
        />
      )}
      <RunsListView onOpen={open} onOpenRequest={onOpenRequest} />
      <div className="shrink-0 border-t border-border-subtle px-4 py-3 max-sm:py-2">
        <Link to="/runs" className={`rounded inline-flex text-small text-link hover:underline max-sm:min-h-11 max-sm:items-center ${FOCUS_RING}`}>All runs ›</Link>
      </div>
    </div>
  )
}
