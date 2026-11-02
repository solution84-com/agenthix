/**
 * What `front-door` prints (host-management spec §6; the CLI board's *front-door*): the warning before it takes
 * ports 80 and 443, the steps for a web server of the machine's own, and what is true afterwards.
 */
import type { FrontDoorCheck } from '../frontDoor/frontDoor'
import { cmd, nextStep, product, wrap } from './words'

const IN = '  '

export const FRONT_DOOR_FLAG = '--take-ports-80-and-443'

export function frontDoorWarning(c: FrontDoorCheck, machine: string): string {
  return [
    wrap(`The front door serves HQ at ${c.address} itself, with certificates it gets and renews on its own.`),
    '',
    wrap(`It takes ports 80 and 443 on ${machine}. While it is on, nothing else on this machine can serve web traffic ` +
      'on them: a web server you run now or install later will fail to start.'),
    '',
    wrap(`Uploaded files get their own address, ${c.filesHost}. Point its DNS name at ${machine} too before going on.`),
    '',
  ].join('\n')
}

export const NO_ONE_TO_ASK = wrap(`Not on: this needs an answer and there is no one to ask. From a script, add ${FRONT_DOOR_FLAG}. Nothing changed.`)

export const LEFT_OFF = 'Left off. Nothing changed.'

export function frontDoorOnText(c: FrontDoorCheck, previewsHost?: string): string {
  return [
    wrap(`The front door is on. It serves HQ at ${c.address} and uploaded files at https://${c.filesHost}, and renews their certificates on its own.`),
    ...(previewsHost ? [wrap(`Live apps open at their own address under ${previewsHost}. Each gets its certificate the first time it is opened; the checks above say what any needs.`)] : []),
    nextStep('To turn it off and free ports 80 and 443:', cmd('front-door off')),
  ].join('\n')
}

/** How to point the machine's own web server at HQ, and at its uploaded files' host. */
function ownServerSteps(c: FrontDoorCheck): string[] {
  const at = `${c.listen!.bind}:${c.listen!.port}`
  const lines = [wrap(
    `HQ listens on ${at}. To serve it at ${c.address}, point this machine's web server at ${at}` +
    (c.filesHost ? `, for ${c.address} and for https://${c.filesHost}, where uploaded files are served,` : '') +
    ' with a certificate for each, passing on every request\'s own host name. The guide\'s page "Run it on a server" shows how.', IN,
  )]
  lines.push(nextStep(`Or let ${product} take ports 80 and 443 for it:`, cmd('front-door on'), IN))
  return lines
}

/** `front-door` with nothing after it. */
export function frontDoorShow(c: FrontDoorCheck, hosts: string[]): string {
  if (!c.address) return nextStep('Front door  off\n  No HQ runs here, so there is nothing to serve. To install HQ and its site:', cmd('install'), IN)
  if (c.on) {
    return ['Front door  on', wrap(`Serves ${hosts.join(' and ')} on ports 80 and 443, with certificates it renews on its own.`, IN),
      nextStep('To turn it off:', cmd('front-door off'), IN)].join('\n')
  }
  if (c.problem) return ['Front door  off', wrap(c.problem, IN)].join('\n')
  return ['Front door  off', ...ownServerSteps(c)].join('\n')
}

export function frontDoorOffText(c: FrontDoorCheck, wasOn: boolean): string {
  if (!wasOn) return 'The front door is already off. Nothing changed.'
  const at = `${c.listen!.bind}:${c.listen!.port}`
  return wrap(`The front door is off, and ports 80 and 443 are free. Until a web server of this machine's own serves ` +
    `${c.address}, pointed at ${at}, people cannot open HQ there. ${cmd('front-door')} prints the steps.`)
}
