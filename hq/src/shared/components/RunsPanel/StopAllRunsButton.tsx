import { useState } from 'react'
import { useAction, stopAllSessions } from 'wasp/client/operations'
import { Loader2, Square } from 'lucide-react'

/** The organisation-wide Stop all (admins), until the Sites view takes it over. */
export function StopAllRunsButton() {
  const stopAll = useAction(stopAllSessions)
  const [stopping, setStopping] = useState(false)
  return (
    <button
      onClick={async () => {
        setStopping(true)
        try { await stopAll({} as never) } finally { setStopping(false) }
      }}
      disabled={stopping}
      title="Stop every active run in the organisation"
      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-small font-medium transition-colors cursor-pointer bg-danger/10 hover:bg-danger/20 text-danger disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3 fill-current" />}
      Stop all
    </button>
  )
}
