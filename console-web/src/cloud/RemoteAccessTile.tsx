import type { RemoteAccessView } from '@agenthix/core'
import { Tile } from '../pages/dashboard/Tiles'
import { clockOf } from '../pages/remote-access/words'
import { CLOUD } from './words'

/** The sixth tile (board *Fleet*): whether remote access is on, and what it waits for when it cannot be. */
export function RemoteAccessTile({ remote, org }: { remote: RemoteAccessView; org: string | null }) {
  const { state } = remote
  return (
    <Tile label="Remote access" value={state.on ? 'On' : 'Off'} small>
      {state.on
        ? `Until ${clockOf(state.endsAt)}`
        : remote.organisationConnected
          ? "Turn it on from this machine (the Fleet Console's), under Remote access"
          : `Needs ${org ?? 'the organisation'} connected to ${CLOUD}`}
    </Tile>
  )
}
