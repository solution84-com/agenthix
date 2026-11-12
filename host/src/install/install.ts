/**
 * `agenthix install` on hq's machine (host-management spec §6, §17; the CLI board's *Installing*): hq and its
 * default site, connected by configuration (adr-0070), from the state folder's settings and secrets, and one link
 * for the first account. Running it again changes nothing that is set: it starts what is stopped.
 *
 * `install --demo` (adr-0186, the live demo spec's *Deployment*) installs the same images as a public demo: hq and the
 * site with `DEMO_MODE`, the site without the Docker socket, no Fleet Console and no nightly backup. Only a first install
 * chooses it; the installation's record keeps it for every command after.
 */
import type { Progress } from '../sockets/lineServer'
import { composeJson, hqProject } from '../compose/projects'
import { consoleAddress } from '../compose/console'
import { siteComposeProject } from './siteCompose'
import { consoleHere, startLocalConsole } from './console'
import { joinLocalConsole } from '../link/localConsole'
import { checkImages, fetchImages, type ImagePins } from '../images/images'
import { siteImagesWanted, sitePins, siteRefs } from '../images/siteImages'
import { POSTGRES_IMAGE } from '../images/published'
import { installSecrets } from '../state/secrets'
import { installed, type Context, type StoredHq, type StoredSite } from '../service/context'
import type { HqStatusData } from '../hq/control'
import { Refusal, type InstallResult } from '../owner/results'
import { filesOriginKept } from '../frontDoor/given'
import { addressProblem, listenerFor } from './address'
import { forgetSuspended } from '../lifecycle/suspend'
import { cmd, product } from '../cli/words'
import { installSubnets } from '../compose/subnets'
import { keepAgentSlice, pickAgentSlice } from '../compose/agentSlice'
import { chooseHqPort, choosePorts, refuseOtherPort, type PortChoice } from './ports'
import { readInstallation, recordDemo, recordPorts } from '../state/installation'
import { checkPorts, CONSOLE_BIND } from './portCheck'
import { refuseWhileReceiving } from '../move/record'

async function step<T>(progress: (p: Progress) => void, name: string, run: () => Promise<{ value: T; outcome: string }>): Promise<T> {
  progress({ event: 'step', step: name })
  const { value, outcome } = await run()
  progress({ event: 'stepDone', outcome })
  return value
}

async function waitFor<T>(ctx: Context, limitMs: number, probe: () => Promise<T | null>): Promise<T | null> {
  const until = ctx.now().getTime() + limitMs
  for (;;) {
    const value = await probe()
    if (value !== null) return value
    if (ctx.now().getTime() >= until) return null
    await ctx.sleep(ctx.waits.pollMs)
  }
}

/**
 * The CLI board's image lines: every signature checked before anything is fetched, then HQ's images and the
 * site's, each by the digest its signature covers.
 */
async function getImages(progress: (p: Progress) => void, ctx: Context, hq: StoredHq, site: StoredSite, withConsole: boolean): Promise<{ hq: ImagePins; site: ImagePins; console: ImagePins }> {
  const pins = await step(progress, `Checking the images are signed by ${product}`, async () => {
    const { pins, checked } = await checkImages(ctx, [
      { part: 'hq-server', version: hq.version }, { part: 'hq-web', version: hq.version }, { part: 'relay', version: hq.version },
      ...siteImagesWanted(site.version),
      ...(withConsole ? [{ part: 'console' as const, version: hq.version }] : []),
    ])
    return { value: pins, outcome: checked ? 'passes' : 'not checked: images built here (development build)' }
  })
  await step(progress, `Pulling HQ ${hq.version} (4 images)`, async () => {
    await fetchImages(ctx, [POSTGRES_IMAGE, pins['hq-server']!, pins['hq-web']!, pins.relay!])
    return { value: undefined, outcome: 'done' }
  })
  await step(progress, `Pulling the site ${site.version}, the agent image and the workflow executor`, async () => {
    await fetchImages(ctx, siteRefs(pins))
    return { value: undefined, outcome: 'done' }
  })
  if (withConsole) {
    await step(progress, `Pulling the Fleet Console ${hq.version}`, async () => {
      await fetchImages(ctx, [pins.console!])
      return { value: undefined, outcome: 'done' }
    })
  }
  return {
    hq: { 'hq-server': pins['hq-server'], 'hq-web': pins['hq-web'], relay: pins.relay },
    site: sitePins(pins),
    console: { console: pins.console },
  }
}

let busy = false

/**
 * What an install is asked: HQ's address, the ports its machine admin chose, when they chose them, and `demo` for
 * `install --demo`.
 */
export type InstallAsk = PortChoice & { address: string; demo?: boolean }

export async function install(ctx: Context, ask: InstallAsk, progress: (p: Progress) => void): Promise<InstallResult> {
  if (busy) throw new Refusal('busy', 'An install is already running on this machine. Wait for it to finish.')
  busy = true
  try {
    return await run(ctx, ask, progress)
  } finally {
    busy = false
  }
}

async function run(ctx: Context, ask: InstallAsk, progress: (p: Progress) => void): Promise<InstallResult> {
  const { address } = ask
  const problem = addressProblem(address)
  if (problem) throw new Refusal('malformed', `HQ cannot be at ${address}: ${problem}.`)
  refuseWhileReceiving(ctx)

  const before = installed(ctx)
  if (before.hq && before.hq.settings.address !== address) {
    throw new Refusal('already_installed', `HQ is already installed here, at ${before.hq.settings.address}. Nothing was changed.`)
  }
  // A first install chooses whether this is a demo; a re-run keeps what was chosen, and refuses being asked otherwise.
  const recordedDemo = readInstallation(ctx.state)?.demo === true
  const demo = before.hq ? recordedDemo : ask.demo === true
  if (before.hq && ask.demo && !recordedDemo) {
    throw new Refusal('already_installed', `HQ is already installed here, at ${address}, and it is not a demo. A demo is installed under an installation of its own (INSTALL_NAMESPACE). Nothing was changed.`)
  }
  if (demo && ask.consolePort !== undefined) {
    throw new Refusal('malformed', 'A demo has no Fleet Console, so --console-port has nothing to choose. Nothing was changed.')
  }
  // Chosen once, then read back: a re-run asking for other ports is refused rather than ignored.
  const recorded = readInstallation(ctx.state)?.ports ?? { hq: null, console: null }
  if (before.hq) refuseOtherPort('hq', ask.hqPort, recorded.hq)
  if (consoleHere(ctx)) refuseOtherPort('console', ask.consolePort, recorded.console)
  // A demo publishes HQ's port alone.
  const ports = demo ? { hq: chooseHqPort(address, ask.hqPort, recorded.hq), console: null } : choosePorts(address, ask, recorded)
  if (ctx.figuresWarning) throw new Refusal('failed', ctx.figuresWarning)
  const paths = await ctx.machinePaths()
  if (!paths) {
    throw new Refusal('failed', `The host service cannot find its state folder on this machine. Start its container with the folder mounted at /state, as the guide's command does.`)
  }
  // Another installation's HQ may run beside this one; only a port one of them holds is refused (one port plan, Rule 4).
  await checkPorts(ctx, [
    { port: ports.hq, part: 'hq', bind: listenerFor(address).bind },
    ...(ports.console === null ? [] : [{ port: ports.console, part: 'console' as const, bind: CONSOLE_BIND }]),
  ])

  // Before anything is fetched or written: with no address range left, nothing could start.
  const subnets = await installSubnets(ctx)
  const agentSlice = await pickAgentSlice(ctx)

  const at = ctx.now().toISOString()
  const version = ctx.machine.hostServiceVersion
  const keptHq: StoredHq = before.hq?.settings ?? { address, ...listenerFor(address), filesOrigin: filesOriginKept(ctx.state, address), version, installedAt: at }
  // Every machine carries one site, always named after the machine (spec §6).
  const keptSite: StoredSite = { ...(before.site?.settings ?? { version, installedAt: at }), name: ctx.machine.name }
  // Before anything is written: an image that fails its check leaves the machine as it was.
  const images = await getImages(progress, ctx, keptHq, keptSite, !demo)
  const hq: StoredHq = { ...keptHq, images: images.hq }
  const site: StoredSite = { ...keptSite, images: images.site }

  await step(progress, "Writing HQ's and its site's settings", async () => {
    keepAgentSlice(ctx.state, agentSlice)
    // Before any compose file is written, since each reads the record to know whether it is a demo's.
    if (!before.hq) recordDemo(ctx.state, demo)
    const installation = recordPorts(ctx.state, demo ? { hq: ports.hq } : ports)
    const secrets = installSecrets(ctx.state)
    ctx.state.writeJson(['hq', 'settings.json'], hq)
    ctx.state.writeJson(['site', 'settings.json'], site)
    ctx.state.writePrivate(['hq', 'compose.json'], composeJson(hqProject(ctx.names, hq, secrets, ctx.machine.name, subnets, installation)))
    ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, site, secrets, paths, subnets)))
    return { value: undefined, outcome: before.hq ? 'kept' : 'done' }
  })

  const written = installed(ctx)
  const status = await step<HqStatusData>(progress, 'Starting HQ', async () => {
    await ctx.docker.composeUp(written.hq!.project, written.hq!.file)
    const answered = await waitFor(ctx, ctx.waits.hqMs, () => ctx.hqControl.status())
    if (!answered) {
      throw new Refusal('failed', `HQ did not answer within ${Math.round(ctx.waits.hqMs / 60_000)} minutes. See why: ${cmd('hq logs')}`)
    }
    return { value: answered, outcome: 'answers' }
  })

  const connected = await step(progress, `Starting the site ${site.name} (private Docker network)`, async () => {
    await ctx.docker.composeUp(written.site!.project, written.site!.file)
    const seen = await waitFor(ctx, ctx.waits.siteMs, async () => {
      const s = await ctx.hqControl.status()
      return s?.hqSite.state === 'connected' ? true : null
    })
    return { value: seen === true, outcome: seen ? 'connected to HQ' : 'not connected yet' }
  })

  // Both projects are started, so nothing is suspended any more.
  forgetSuspended(ctx)

  // The Fleet Console beside HQ (spec §7), and this machine connected to it like any other. A demo has none: nothing in
  // it may reach the machine from a browser (the live demo spec's *No machine-level access*).
  if (ports.console !== null) {
    const consolePort = ports.console
    await step(progress, `Starting the Fleet Console on ${consoleAddress(consolePort).replace('http://', '')}`, async () => {
      await startLocalConsole(ctx, { port: ports.hq, version: hq.version }, images.console)
      return { value: undefined, outcome: 'started' }
    })
    await step(progress, 'Connecting this machine to its Fleet Console', async () => {
      const joined = await joinLocalConsole(ctx, ctx.waits.siteMs)
      return { value: undefined, outcome: joined ? 'connected' : 'not yet; it keeps trying' }
    })
  }

  // A demo seeds its sample organisation at start, so no one is given the first account.
  let link: string | null = null
  if (status.users === 0 && !demo) {
    const made = await ctx.hqControl.link('invite-admin', [])
    if (made?.ok) link = made.data.link
  }
  return {
    address: hq.address,
    listen: { bind: hq.bind, port: ports.hq },
    siteName: site.name,
    siteConnected: connected,
    users: status.users,
    firstAccountLink: link,
    ...(demo ? { demo: true as const } : {}),
  }
}
