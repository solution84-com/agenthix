import { useEffect, useState } from 'react'
import { useShellPanels } from '../context/useShellPanels'
import { useIsMobile } from '../hooks/useIsMobile'
import { NotificationPanel } from '../components/NotificationPanel/NotificationPanel'
import { RunsPanelList } from '../components/RunsPanel/RunsPanelList'
import { RunsPanelSession } from '../components/RunsPanel/RunsPanelSession'
import { ApprovalRequestView } from '../components/NotificationPanel/ApprovalRequestView'

/**
 * Shows the open Notifications or Runs panel. On a wide screen it lies against the
 * rail, over the project menu and the content; clicking outside it or pressing
 * Escape closes it, and the screen beneath was never left. On a small screen it fills the screen.
 *
 * Tapping a waiting tool request in either panel opens it in the panel itself, in place
 * of its list, with one header row back to it.
 */
export function ShellPanelHost({ againstRail = false }: { againstRail?: boolean }) {
  const { activePanel, runSessionId, close } = useShellPanels()
  const isMobile = useIsMobile()
  const [request, setRequest] = useState<{ panel: string; taskKey: string } | null>(null)
  // A request belongs to the panel it was opened from; switching panels or closing drops it.
  const shownRequest = request && request.panel === activePanel ? request : null
  useEffect(() => { if (request && request.panel !== activePanel) setRequest(null) }, [request, activePanel])

  useEffect(() => {
    if (!activePanel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePanel, close])

  if (!activePanel) return null

  const label = activePanel === 'notifications' ? 'Notifications' : 'Runs'
  const openRequest = (taskKey: string) => setRequest({ panel: activePanel, taskKey })
  const content = shownRequest
    ? <ApprovalRequestView taskKey={shownRequest.taskKey} from={label} onBack={() => setRequest(null)} />
    : activePanel === 'notifications'
      ? <NotificationPanel onOpenRequest={openRequest} />
      : runSessionId ? <RunsPanelSession sessionId={runSessionId} /> : <RunsPanelList onOpenRequest={openRequest} />

  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-label={label}
        data-testid="shell-panel"
        className="fixed inset-0 z-50 bg-surface-1 flex flex-col overflow-hidden"
      >
        {content}
      </div>
    )
  }

  // The rail is 56 px (lg:w-14), the app's left edge.
  const edge = againstRail ? 'left-14' : 'left-0'
  return (
    <>
      <div data-testid="shell-panel-dismiss" onClick={close} className={`absolute inset-y-0 right-0 z-20 bg-text-muted/10 ${edge}`} />
      <div
        role="dialog"
        aria-label={label}
        data-testid="shell-panel"
        className={`absolute inset-y-0 z-30 ${edge} w-[420px] max-w-full bg-surface-1 border-r border-border shadow-pop flex flex-col overflow-hidden`}
      >
        {content}
      </div>
    </>
  )
}
