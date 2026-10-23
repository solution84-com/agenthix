/**
 * The ports a machine that receives HQ will publish it and its Fleet Console on, when its machine admin (at `console
 * connect`) or the move's request chose them: checked before anything arrives, so a move never fails on them later.
 */
import type { PublishedPortChoice } from '@agenthix/core'
import { Refusal } from '../owner/results'
import { publishedPortProblem } from '../install/ports'

export function refuseUnpublishable(ports: PublishedPortChoice): void {
  const problem = (ports.hqPort === undefined ? null : publishedPortProblem(ports.hqPort, 'hq')) ??
    (ports.consolePort === undefined ? null : publishedPortProblem(ports.consolePort, 'console'))
  if (problem) throw new Refusal('malformed', `${problem} Nothing was changed.`)
  if (ports.hqPort !== undefined && ports.hqPort === ports.consolePort) {
    throw new Refusal('malformed', `HQ and the Fleet Console cannot both be published on port ${ports.hqPort}. Choose another for one of them. Nothing was changed.`)
  }
}
