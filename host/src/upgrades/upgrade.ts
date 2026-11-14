/**
 * An upgrade of HQ (with its site) or of the site (spec §11, diagram 8): every new image's signature checked and
 * the images fetched by digest before anything stops; then what is upgraded is stopped, a sealed backup taken, the
 * compose projects switched to the new pinned images, and HQ and the site given time to come up healthy. If they
 * do not, everything is put back — the previous images and the backup — and the outcome says so in words.
 *
 * What was there is written down before the switch (`underWay`), so an upgrade a restart cut short is finished, or
 * put back, by whatever runs next: the scheduler running it again, or the next upgrade. Before that, from the moment
 * anything stops until `underWay` is written, `stopping` says what was stopped, so a restart while the backup is taken
 * starts it again.
 *
 * On a development build the same upgrade goes to images built on the machine under one tag (`builtUpgrade.ts`),
 * without the signature check and the fetch.
 *
 * Every step and its outcome also goes to the host service's log, with the health check's problem and, when putting
 * it back fails too, why: an upgrade nobody watches, a scheduled one, never ends without a word.
 */
import type { Progress } from '../sockets/lineServer'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { EndedPartway } from '../scheduled/endedPartway'
import { cmd, product } from '../cli/words'
import { checkPorts } from '../install/portCheck'
import { checkImages, fetchImages } from '../images/images'
import { sitePins } from '../images/siteImages'
import { hqPins } from '../images/hqImages'
import { partsOf } from '../images/partsOfVersion'
import { exclusive, exclusiveWhenFree, takeBackup, type OnWait } from '../backups/take'
import { checkUpgrade, whoText, type Target } from './rules'
import { healthProblem } from './health'
import { putBack, startDatabases, startTarget, stopTarget, writeProjects } from './rollback'
import { readUpgrades, writeUpgrades, type Stopping, type UnderWay } from './settings'
import { PARTS_OF } from './versions'
import { refuseUnwritable } from './preflight'
import { againCommand, builtPins, builtText, checkBuiltUpgrade, type BuiltImages } from './builtUpgrade'
import { DEVELOPMENT } from '../images/ownVersion'

export type UpgradeOutcome =
  | { version: string; rolledBack: false }
  /** `version` is the one running again; `reason` says what failed and what was put back. */
  | { version: string; rolledBack: true; reason: string }

type Report = (p: Progress) => void
type Log = (line: string) => void

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/\.$/, '')

/** Lines for the host service's log, each naming the upgrade. */
const logOf = (ctx: Context, target: Target, to: string): Log => line =>
  ctx.log?.(`Upgrade of ${target === 'hq' ? 'HQ' : whoText(ctx, target)} to ${to}: ${line}`)

async function step<T>(progress: Report, log: Log, name: string, work: () => Promise<T>, outcome: (v: T) => string = () => 'done'): Promise<T> {
  progress({ event: 'step', step: name })
  let value: T
  try {
    value = await work()
  } catch (err) {
    log(`${name}: failed: ${errorText(err)}.`)
    throw err
  }
  const said = outcome(value)
  log(`${name}: ${said}.`)
  progress({ event: 'stepDone', outcome: said })
  return value
}

const two = (n: number) => String(n).padStart(2, '0')
const clock = (iso: string) => {
  const d = new Date(iso)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/** Waits for a backup or change that holds the machine, such as the nightly backup, when `onBusy` is given. */
function whenFree<T>(ctx: Context, onBusy: OnWait | null, work: () => Promise<T>): Promise<T> {
  return onBusy ? exclusiveWhenFree(ctx, 'version upgrade', work, onBusy) : exclusive('version upgrade', work)
}

/** What an upgrade goes to, in words: its version, or the tag of the images built here. */
const toText = (u: { to: string; built?: { tag: string } | string | null }) =>
  (u.built ? builtText(typeof u.built === 'string' ? u.built : u.built.tag) : u.to)

/**
 * The health check of an upgrade under way; when it fails, everything is put back. `notStarted`: why the new version
 * could not be started at all, which fails it without a health check, since nothing new runs to be checked.
 */
async function settle(ctx: Context, u: UnderWay, progress: Report, notStarted: string | null = null): Promise<UpgradeOutcome> {
  const to = toText(u)
  const from = u.built ? 'the images it ran before' : u.from
  const log = logOf(ctx, u.target, to)
  const problem = notStarted ?? await step(progress, log, 'Health check', () => healthProblem(ctx, u.target, u.to, u.built?.ids), p => (p ? `fails: ${p}` : 'passes'))
  if (!problem) {
    writeUpgrades(ctx.state, s => {
      s.underWay = null
      s.rolledBack = s.rolledBack.filter(v => v !== `${u.target}@${u.to}`)
      s.last = { target: u.target, to, endedAt: ctx.now().toISOString(), rolledBack: false, reason: null }
    })
    log(`done; ${u.target === 'hq' ? 'HQ and its site run' : 'it runs'} ${to}.`)
    return { version: u.to, rolledBack: false }
  }
  const who = whoText(ctx, u.target, true)
  const failed = notStarted
    ? `${who} could not be started on ${to}: ${notStarted}.`
    : `${who} did not pass its health check: ${problem}.`
  try {
    await step(progress, log, `Going back to ${from}`, () => putBack(ctx, u))
  } catch (err) {
    const databases = u.target === 'hq' ? "HQ's and its site's databases are" : "the site's database is"
    const words = `${failed} Putting it back failed too: ${errorText(err)}. The backup from ${clock(u.backupTakenAt)} is on this machine, ` +
      `and ${databases} left running. The host service tries again when it next restarts; ` +
      `to try again now: ${againCommand(u.target, u.to, u.built?.tag)}`
    writeUpgrades(ctx.state, s => {
      if (s.underWay) s.underWay.problem = words
    })
    log(`ended part-way. ${words}`)
    throw new EndedPartway(words)
  }
  const restored = u.target === 'hq' ? 'restored the backup' : 'restored the site from the backup'
  const reason = `${failed} The host service ${restored} from ${clock(u.backupTakenAt)}, and ${u.target === 'hq' ? 'HQ' : 'it'} ${u.built ? 'runs the images it ran before' : `is on ${u.from}`} again.`
  writeUpgrades(ctx.state, s => {
    s.underWay = null
    // A build is no version to hold back from being applied by itself again.
    if (!u.built && !s.rolledBack.includes(`${u.target}@${u.to}`)) s.rolledBack.push(`${u.target}@${u.to}`)
    s.last = { target: u.target, to, endedAt: ctx.now().toISOString(), rolledBack: true, reason }
  })
  log(`rolled back. ${reason}`)
  return { version: u.from, rolledBack: true, reason }
}

/** Starts again what an upgrade stopped before its backup was taken: nothing else had changed. */
async function startStopped(ctx: Context, s: Stopping, progress: Report): Promise<UpgradeOutcome> {
  const who = s.target === 'hq' ? 'HQ and its site' : whoText(ctx, s.target)
  const to = toText(s)
  const from = s.built ? 'the images it ran before' : s.from
  const log = logOf(ctx, s.target, to)
  await step(progress, log, `Starting ${who} again on ${from}`, () => startTarget(ctx, s.target))
  const reason = `The upgrade to ${to} stopped before its backup was taken, so nothing was changed; ${who} ${s.target === 'hq' ? 'are' : 'is'} started again on ${from}.`
  writeUpgrades(ctx.state, u => {
    u.stopping = null
    u.last = { target: s.target, to, endedAt: ctx.now().toISOString(), rolledBack: true, reason }
  })
  log(reason)
  return { version: s.from, rolledBack: true, reason }
}

/** Finishes, or puts back, an upgrade a restart cut short; null when none was under way. */
export function finishUnderWay(ctx: Context, progress: Report = () => {}): Promise<UpgradeOutcome | null> {
  const s = readUpgrades(ctx.state)
  if (!s.underWay && !s.stopping) return Promise.resolve(null)
  return whenFree(ctx, () => {}, async () => {
    const { underWay: u, stopping } = readUpgrades(ctx.state)
    if (u) return settle(ctx, u, progress)
    return stopping ? startStopped(ctx, stopping, progress) : null
  })
}

/**
 * `built`: on a development build, the tag of the images built here to upgrade to, with `version` the development
 * build's own (`dev`).
 */
export function upgrade(
  ctx: Context, target: Target, version: string, progress: Report,
  opts: { onBusy?: OnWait; built?: string } = {},
): Promise<UpgradeOutcome> {
  const built = opts.built ?? null
  return whenFree(ctx, opts.onBusy ?? null, async () => {
    if (built) checkBuiltUpgrade(ctx, target, built)
    const { underWay: pending, stopping } = readUpgrades(ctx.state)
    if (!pending && stopping) await startStopped(ctx, stopping, progress)
    if (pending) {
      const settled = await settle(ctx, pending, progress)
      if (pending.target === target && pending.to === version && (pending.built?.tag ?? null) === built) return settled
    }
    return run(ctx, target, built ? DEVELOPMENT : version, built, progress)
  })
}

async function run(ctx: Context, target: Target, version: string, builtTag: string | null, progress: Report): Promise<UpgradeOutcome> {
  const from = builtTag ? installed(ctx)[target]!.settings.version : checkUpgrade(ctx, target, version)
  const log = logOf(ctx, target, builtTag ? builtText(builtTag) : version)
  // Before anything is fetched: HQ started again on a port another program took meanwhile would only fail its health check.
  const hq = installed(ctx).hq
  if (target === 'hq' && hq?.port != null) {
    await checkPorts(ctx, [{ port: hq.port, part: 'hq', bind: hq.settings.bind, another: `Free it, or move HQ with ${cmd('hq address <address>')}.` }])
  }
  const paths = await ctx.machinePaths()
  if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine, so it cannot upgrade. Nothing was changed.')
  await refuseUnwritable(ctx, target, version, paths)
  log(`from ${builtTag ? 'the images it runs now' : from}.`)
  const parts = partsOf(PARTS_OF[target], version)
  // Before anything stops: an image that fails its check, or cannot be fetched, leaves everything running as it was.
  let built: BuiltImages | undefined
  const { pins } = builtTag
    ? await step(progress, log, `Finding ${builtText(builtTag)} on this machine`, async () => {
      const found = await builtPins(ctx, parts, builtTag)
      built = found.built
      return found
    }, () => 'found')
    : await step(progress, log, `Checking the images are signed by ${product}`, () =>
      checkImages(ctx, parts.map(part => ({ part, version }))), () => 'passes')
  if (!builtTag) {
    await step(progress, log, target === 'hq' ? `Pulling HQ ${version} and its site` : `Pulling the site ${version}`, () =>
      fetchImages(ctx, parts.map(part => pins[part]!)))
  }

  const before = installed(ctx)
  const who = whoText(ctx, target, true)
  const fromText = builtTag ? 'the images it ran before' : from
  writeUpgrades(ctx.state, s => { s.stopping = { target, to: version, from, at: ctx.now().toISOString(), ...(builtTag ? { built: builtTag } : {}) } })
  await step(progress, log, target === 'hq' ? 'Stopping HQ and its site' : 'Stopping the site', () => stopTarget(ctx, target))
  const backup = await step(progress, log, 'Taking a sealed backup', async () => {
    try {
      await startDatabases(ctx, target)
      return await takeBackup(ctx, 'beforeUpgrade')
    } catch (err) {
      // Once started again, nothing is left for a restart to start.
      await startTarget(ctx, target).then(() => writeUpgrades(ctx.state, s => { s.stopping = null })).catch(() => {})
      throw new Refusal('failed', `Not upgraded, since an upgrade takes a backup first: ${errorText(err)}. ${who} is started again on ${fromText}.`)
    }
  })

  const u: UnderWay = {
    target, to: version, from,
    hq: before.hq?.settings ?? null,
    site: before.site!.settings,
    backupId: backup.id,
    backupTakenAt: backup.takenAt,
    ...(built ? { built } : {}),
  }
  writeUpgrades(ctx.state, s => {
    s.underWay = u
    s.stopping = null
  })
  let notStarted: string | null = null
  await step(progress, log, `Starting ${builtTag ? builtText(builtTag) : version}`, async () => {
    try {
      const hq = target === 'hq' && u.hq ? { ...u.hq, version, images: hqPins(pins) } : null
      await writeProjects(ctx, hq, { ...u.site, version, images: sitePins(pins) }, paths)
      await startTarget(ctx, target)
    } catch (err) {
      // Compose's own words, which the put-back that follows carries into the log and the outcome.
      notStarted = errorText(err)
    }
  }, () => (notStarted ? `fails: ${notStarted}` : 'done'))
  return settle(ctx, u, progress, notStarted)
}
