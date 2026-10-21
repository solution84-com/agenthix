/**
 * The launcher (ADR-0118): the host service image's second entry point, `node /app/dist/launcher.js`.
 *
 * - `swap <image id>`: run by the host service as a short-lived container from its own image, with the Docker
 *   socket and the state folder, to replace it with the new image it checked (`swap.ts`). Docker restarts it
 *   with the machine until it has ended, so it then clears its own restart policy.
 * - `answer`: run inside a new host service by the launcher of the version before it, to ask it its version on
 *   its owner socket. Every version keeps this command and its output, `{"version":"…"}`.
 * - `uninstall <namespace> [<state folder's name>]`: run by the host service as the last of `agenthix uninstall`, to
 *   remove its container, its figures volume and its state folder once it has answered (`uninstall.ts`).
 */
import { DEFAULT_INSTALL_NAMESPACE } from '@agenthix/core'
import { HOST_SERVICE_VERSION, OWNER_SOCKET, STATE_DIR } from '../config'
import { dockerCli } from '../docker/docker'
import { Containers } from '../docker/containers'
import { DockerRemoval } from '../docker/removal'
import { ask } from '../sockets/lineServer'
import { StateFolder } from '../state/folder'
import { namesFor, recordNamespace } from '../state/namespace'
import { runSwitch } from './swap'
import { helperName, parseHelperArgs, runHelper, STATE_IN_HELPER } from './uninstall'

const IMAGE_ID = /^sha256:[0-9a-f]{64}$/

async function answer(): Promise<number> {
  const reply = await ask(OWNER_SOCKET, { op: 'host.version' })
  const version = (reply.result as { version?: unknown } | undefined)?.version
  if (reply.ok !== true || typeof version !== 'string') return 1
  process.stdout.write(`${JSON.stringify({ version })}\n`)
  return 0
}

async function swap(imageId: string): Promise<number> {
  const containers = new Containers(dockerCli)
  const state = new StateFolder(STATE_DIR)
  // The host service recorded the namespace at its first start; the launcher only reads it.
  const names = namesFor(recordNamespace(state, DEFAULT_INSTALL_NAMESPACE))
  const ended = await runSwitch({
    containers,
    state,
    names,
    ownVersion: HOST_SERVICE_VERSION,
    now: () => new Date(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    pollMs: 3_000,
  }, imageId)
  console.log(ended.phase === 'done' ? `The host service is on ${ended.to}.` : ended.reason)
  await containers.noRestart(names.launcherContainer).catch(() => {})
  return ended.phase === 'done' ? 0 : 1
}

async function uninstall(args: string[]): Promise<number> {
  const parsed = parseHelperArgs(args)
  if (!parsed) return 2
  const removal = new DockerRemoval(dockerCli)
  const names = namesFor(parsed.namespace)
  const left = await runHelper({
    names, folder: parsed.folder, stateDir: STATE_IN_HELPER,
    remove: { container: name => removal.container(name), volume: name => removal.volume(name) },
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    log: line => console.log(line),
  })
  if (left.length) return 1
  // Its own container last: Docker ends this process with it, and nothing of the install is left.
  await removal.container(helperName(names))
  return 0
}

const [mode, ...args] = process.argv.slice(2)
const [imageId] = args
const run = mode === 'answer' ? answer()
  : mode === 'swap' && imageId && IMAGE_ID.test(imageId) ? swap(imageId)
  : mode === 'uninstall' ? uninstall(args)
  : Promise.resolve(2)
run.then(code => process.exit(code), err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
