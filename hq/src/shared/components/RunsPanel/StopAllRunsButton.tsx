import { useState } from 'react'
import { useAction, stopAllSessions } from 'wasp/client/operations'
import { Square } from 'lucide-react'
import { Button } from '@agenthix/ui/primitives'
import { useAttentionWhen } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../failureWords'

/** The organisation-wide Stop all (admins), on the organisation's Runs, until the Sites view takes it over. */
export function StopAllRunsButton() {
  const stopAll = useAction(stopAllSessions)
  const [stopping, setStopping] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const failure = useAttentionWhen(failed, { kind: 'alert', title: 'The runs were not stopped', onClose: () => setFailed(null) })
  return (
    <>
    {failure}
    <Button
      variant="secondary"
      onClick={async () => {
        setStopping(true)
        setFailed(null)
        try { await stopAll({} as never) } catch (e) {
          setFailed(pressFailureWords(e, 'Stop all did not go through. Nothing was stopped.'))
        } finally { setStopping(false) }
      }}
      disabled={stopping}
      title="Stop every active run in the organisation"
      leadingIcon={<Square size={14} aria-hidden className="fill-current" />}
    >
      Stop all
    </Button>
    </>
  )
}
