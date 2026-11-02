/**
 * What a Docker event on a live preview's container means to the guard (*notMadeBySite*): a `docker exec` the site
 * did not make, an attach, or a copy into the container is the signal at once; any other change to the container is
 * a reason to look at it now rather than at the next check.
 *
 * The site's own execs are known by what they run: the sandbox launcher (apps, services, installs), the guard's own
 * look and kill, the forwarder and the per-stream relay that carry an app's streams, and the hand-off of a workflow's
 * secrets. Anything else is not the site's.
 */
import { COMMAND_LAUNCHER_PATH } from '../../../agents/runtime/agentImage'
import { APP_RELAY_SCRIPT } from '../apps/appConnect'
import { appForwarderArgv } from '../apps/appForwarderScript'
import type { DockerEvent } from './guardDocker'
import { KILL_SCRIPT, SNAPSHOT_SCRIPT } from './processes'
import { SECRETS_SCRIPT } from '../secrets/secretsFolder'

export type EventMeaning = { kind: 'signal'; what: string } | { kind: 'look' } | { kind: 'none' }

const EXEC = /^exec_(create|start): /
const LOOK = new Set(['create', 'start', 'restart', 'update', 'unpause', 'pause', 'rename', 'die', 'oom', 'kill', 'destroy', 'stop'])
const NEVER = new Map([['attach', 'an attach to its container'], ['extract-to-dir', 'files copied into its container'], ['commit', 'its container saved as an image']])

const SITE_COMMANDS = [
  COMMAND_LAUNCHER_PATH,
  `node -e ${APP_RELAY_SCRIPT}`,
  appForwarderArgv().join(' '),
  `sh -c ${SNAPSHOT_SCRIPT}`,
  `sh -c ${KILL_SCRIPT}`,
  `sh -c ${SECRETS_SCRIPT}`,
]

export function siteMadeExec(command: string): boolean {
  return SITE_COMMANDS.some(c => command === c || command.startsWith(`${c} `))
}

export function execCommand(event: DockerEvent): string | null {
  const exec = EXEC.exec(event.action)
  return exec ? event.action.slice(exec[0].length) : null
}

export function meaningOf(event: DockerEvent): EventMeaning {
  const command = execCommand(event)
  if (command !== null) {
    return siteMadeExec(command) ? { kind: 'none' } : { kind: 'signal', what: `a command run in its container: ${command.slice(0, 120)}` }
  }
  const action = event.action.split(':')[0]?.trim() ?? ''
  const never = NEVER.get(action)
  if (never) return { kind: 'signal', what: never }
  return LOOK.has(action) ? { kind: 'look' } : { kind: 'none' }
}
