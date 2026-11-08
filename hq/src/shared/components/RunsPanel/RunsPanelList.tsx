import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router'
import type { MyRun } from '../../../runs/queries'
import { PanelHead } from '../NotificationPanel/PanelHead'
import { RunsListView } from './RunsListView'

/**
 * The Runs panel (the Runs panel design): the person's own runs across every project, what needs them first, in the
 * Workroom's four groups. A click on a run opens its task or conversation; a tap on one asking for an okay opens its
 * request in the panel. Open Workrooms › is the live view across projects; All runs › the history.
 */
export function RunsPanelList({ onOpenRequest }: { onOpenRequest: (taskKey: string) => void }) {
  const navigate = useNavigate()
  // Leaving the page closes the panel: its state is in the URL being replaced.
  const open = useCallback((run: MyRun) => navigate(run.href), [navigate])

  return (
    <div className="flex flex-col h-full">
      <PanelHead
        title="Runs"
        action={<Link to="/workrooms" className="text-small text-accent hover:underline">Open Workrooms ›</Link>}
      />
      <RunsListView onOpen={open} onOpenRequest={onOpenRequest} />
      <div className="shrink-0 border-t border-border-subtle px-4 py-3 max-sm:py-2">
        <Link to="/runs" className="inline-flex text-small text-accent hover:underline max-sm:min-h-11 max-sm:items-center">All runs ›</Link>
      </div>
    </div>
  )
}
