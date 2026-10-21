/**
 * `frontDoor.set` from whoever asked. A certificate and its private key (given.ts) are accepted from Cloud's controller
 * alone: the dispatch records who asked, and this refuses anyone else, whatever the request claims.
 */
import type { HostActor, HostRequest } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import { frontDoorOff, frontDoorOn } from './frontDoor'

type FrontDoorOn = Extract<HostRequest, { op: 'frontDoor.set'; on: true }>

export function frontDoorSet(ctx: Context, request: Extract<HostRequest, { op: 'frontDoor.set' }>, by: HostActor, progress: (p: Progress) => void) {
  if (!request.on) return frontDoorOff(ctx)
  return setOn(ctx, request, by, progress)
}

async function setOn(ctx: Context, request: FrontDoorOn, by: HostActor, progress: (p: Progress) => void) {
  const given = request.certificate !== undefined || request.privateKey !== undefined
  if (given && by.kind !== 'cloud') {
    throw new Refusal('conflict', "Only Agenthix Cloud gives the front door a certificate; this machine's front door asks for its own. Nothing changed.")
  }
  if (request.previewsHost) {
    throw new Refusal('conflict', "Previews keep their own setup: a wildcard certificate needs your DNS provider's challenge, which the front door does not hold. The guide's page \"Run it on a server\" shows how. Nothing changed.")
  }
  const certificate = request.certificate !== undefined && request.privateKey !== undefined
    ? { certificate: request.certificate, privateKey: request.privateKey }
    : undefined
  if (given && !certificate) throw new Refusal('malformed', 'A certificate comes with its private key. Nothing changed.')
  return frontDoorOn(ctx, request.filesHost, progress, certificate)
}
