import { useCallback } from 'react'
import { useAuth } from 'wasp/client/auth'
import { getModelChoices, getSpeechToken, useQuery } from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { PLAYGROUND_PERSON_ID } from '../../../shared/voicePlayground'
import type { SttToken } from '../stt'
import { Playground } from './Playground'
import type { AckSocket } from './playgroundSession'

const BREADCRUMBS = [{ label: 'Voice playground' }]

/** The voice playground, development builds only; its server side refuses anything else too. */
export function VoicePlaygroundPage() {
  return (
    <AppLayout breadcrumbs={BREADCRUMBS}>
      {import.meta.env.DEV
        ? <DevPlayground />
        : <p className="px-4 py-6 text-body text-text-muted lg:px-10">The voice playground exists only in development builds.</p>}
    </AppLayout>
  )
}

function DevPlayground() {
  const { socket } = useSocket()
  const { data: me } = useAuth()
  // The models this person may pick in their own space: what the model picker offers there.
  const { data: choices } = useQuery(getModelChoices, { home: 'PERSON' })
  // The organisation's speech to text, as voice anywhere is given it.
  const getToken = useCallback(async () => (await getSpeechToken()) as unknown as SttToken, [])
  if (!socket || !me) return <p className="px-4 py-6 text-body text-text-muted lg:px-10">Connecting…</p>
  return <Playground socket={socket as unknown as AckSocket} userId={PLAYGROUND_PERSON_ID} getToken={getToken} choices={choices} />
}
