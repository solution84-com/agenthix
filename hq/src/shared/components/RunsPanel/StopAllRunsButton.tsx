import { useState } from 'react'
import { useAction, stopAllSessions } from 'wasp/client/operations'
import { Square } from 'lucide-react'
import { Button } from '@agenthix/ui/primitives'

/** The organisation-wide Stop all (admins), on the organisation's Runs, until the Sites view takes it over. */
export function StopAllRunsButton() {
  const stopAll = useAction(stopAllSessions)
  const [stopping, setStopping] = useState(false)
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        setStopping(true)
        try { await stopAll({} as never) } finally { setStopping(false) }
      }}
      disabled={stopping}
      title="Stop every active run in the organisation"
      leadingIcon={<Square size={14} aria-hidden className="fill-current" />}
    >
      Stop all
    </Button>
  )
}
