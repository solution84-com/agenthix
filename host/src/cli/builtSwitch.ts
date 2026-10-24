/**
 * `upgrades host --image <name or id>`: a development build's switch to another image built on this machine (spec
 * Rule 1), with no signature or version to check. The host service refuses it on a published version.
 */
import type { HostSwitchStarted } from '../upgrades/operations'
import type { HostServiceReady } from '../upgrades/hostService'
import { cmd, nextStep, wrap } from './words'
import type { Ask, UpgradeIo } from './upgrades'

const ANSWER_MINUTES = 3

export async function builtHostCommand(call: Ask, io: UpgradeIo, image: string, yes: boolean): Promise<number> {
  const h = await call<HostServiceReady>({ op: 'upgrades.hostService', built: image })
  const what = `This host service is a development build, so it switches to an image built on this machine, ${image}, with no signature or version to check.`
  if (!h.launcher) {
    io.out([
      wrap(`${what} The launcher is off, so switch in this machine's own shell, not through this command, which runs inside the host service. HQ and the site keep running meanwhile, and everything is kept in the state folder:`),
      '',
      ...h.commands.map(c => `  ${c}`),
    ].join('\n'))
    return 0
  }
  io.out(wrap(`${what} HQ and the site keep running. The host service stops for a minute while one from that image starts with the same settings and state folder, ` +
    `and if the new one does not answer within ${ANSWER_MINUTES} minutes, this one is started again as it was.`))
  if (!(await io.confirm('Go ahead?', yes))) return 1
  await call<HostSwitchStarted>({ op: 'upgrades.hostSwitch', built: image })
  io.out(wrap('The launcher is switching it now; this command ends when the host service stops.'))
  io.out(nextStep('In a few minutes, to see it is running:', cmd('status')))
  return 0
}
