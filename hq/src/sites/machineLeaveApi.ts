import type { HostLeaveApi } from 'wasp/server/api'
import { hostLeftByItself } from '../fleet/hosts'
import { relayHub } from '../fleet/index'
import { reconcileMachineNotices } from './machineNotices'

/**
 * A machine that disconnected itself says so (host-management spec §6), with its machine credential — the one it
 * opened its host link with — whether or not it carries a site. The only effect: hq lists it as having left by itself
 * and refuses its link from then on; a site it carries leaves with its own credential (`leaveApi.ts`). Fleet admins
 * are asked to remove it.
 */
export const hostLeaveHandler: HostLeaveApi = async (req, res) => {
  const auth = req.headers.authorization
  const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
  const left = token ? await hostLeftByItself(token) : 'unknown'
  if (left === 'unknown') {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (left === 'hqMachine') {
    res.status(409).json({ error: 'The machine that runs HQ cannot leave the fleet.' })
    return
  }
  relayHub.revokeHost(left.hostId)
  void reconcileMachineNotices()
  res.status(200).json({ ok: true })
}
