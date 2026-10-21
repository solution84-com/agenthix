import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router'
import type { MyRun } from '../../../runs/queries'
import { PanelHead } from '../NotificationPanel/PanelHead'
import { RunsListView } from './RunsListView'

/**
 * The Runs panel: the person's own runs, waiting for them first. A click on a
 * run opens its task or conversation; Approve approves it there; a tap on a waiting run opens its request in the panel.
 */
export function RunsPanelList({ onOpenRequest }: { onOpenRequest: (taskKey: string) => void }) {
  const navigate = useNavigate()
  // Leaving the page closes the panel: its state is in the URL being replaced.
  const open = useCallback((run: MyRun) => navigate(run.href), [navigate])

  return (
    <div className="flex flex-col h-full">
      <PanelHead
        title="Runs"
        action={<Link to="/runs" className="text-small text-accent hover:underline">Show all ›</Link>}
      />
      <RunsListView onOpen={open} onOpenRequest={onOpenRequest} />
    </div>
  )
}
