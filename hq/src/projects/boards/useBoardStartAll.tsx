import { useState, type ReactNode } from 'react'
import { useAction, startAllAgents } from 'wasp/client/operations'
import { useAttention } from '../../shared/components/AttentionDialog'
import { refusalText } from '../../shared/refusal'
import { StartAllDialog } from '../workroom/StartDialogs'

/**
 * A board's *Start all agents…* (the Board design's key 7): the project's button, the same as the Workroom's. It starts
 * every agent on its ready tasks in rank order, whatever the board's filters, after the Workroom's one confirm. Null
 * for someone who may not work in the project: they do not see it.
 */
export function useBoardStartAll({ projectId, projectName, mayWork, onStarted }: {
  projectId: string
  projectName: string
  mayWork: boolean
  /** The board reads its cards again once the runs are asked for. */
  onStarted: () => void
}): { open: (() => void) | null; dialog: ReactNode } {
  const startAll = useAction(startAllAgents)
  const attention = useAttention()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const start = (taskIds: string[]) => {
    setBusy(true)
    startAll({ projectId, taskIds }).then(
      () => { setAsking(false); onStarted() },
      err => attention.show({ title: 'The agents were not started', text: refusalText(err), retry: () => start(taskIds) }),
    ).finally(() => setBusy(false))
  }

  return {
    open: mayWork ? () => setAsking(true) : null,
    dialog: (
      <>
        {asking && <StartAllDialog projectId={projectId} projectName={projectName} busy={busy} onCancel={() => setAsking(false)} onStart={start} />}
        {attention.dialog}
      </>
    ),
  }
}
