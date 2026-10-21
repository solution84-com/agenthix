import { Notice } from '../../components'
import { CapacityChange } from '../../forms/CapacityChange'
import { useDraft } from '../../forms/drafts'
import { MoveChange, movePath } from '../../forms/MoveChange'
import { RestoreChange } from '../../forms/RestoreChange'
import { SuspendChange } from '../../forms/SuspendChange'
import { UpgradeChange } from '../../forms/UpgradeChange'
import { Link } from '../../router'
import type { FleetResponse } from '../dashboard/types'
import type { ChangeKind, Thing } from './things'

/** The chosen kind's fields, its *When* and its button — or why the thing cannot take any work now. */
export function KindForm({ thing, kind, fleet, pollMs }: { thing: Thing; kind: ChangeKind; fleet: FleetResponse; pollMs?: number }) {
  const host = thing.host
  // Whether it can be asked is decided when the form first opens: a machine that goes quiet once asked — HQ's, when
  // it is suspended — is the work taking effect, not a reason to take the form away.
  const [blockedAtStart] = useDraft('blockedAtStart', thing.unavailable !== null)
  const hq = thing.kind === 'hq'
  if (kind === 'move' && host.move?.role === 'sending') {
    return <Notice title="A move is under way.">{thing.name} is moving now. <Link to={movePath(hq, host.fingerprint)} className="underline">Follow the move</Link>.</Notice>
  }
  if (blockedAtStart && thing.unavailable) return <Notice tone="warning">{thing.unavailable}</Notice>
  switch (kind) {
    case 'capacity': return <CapacityChange host={host} pollMs={pollMs} />
    case 'upgrade': return <UpgradeChange host={host} pollMs={pollMs} />
    case 'suspend': return <SuspendChange host={host} pollMs={pollMs} />
    case 'move': return <MoveChange host={host} hq={hq} fleet={fleet} pollMs={pollMs} />
    case 'restore': return <RestoreChange host={host} pollMs={pollMs} />
  }
}
