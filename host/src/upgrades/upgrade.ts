/**
 * An upgrade of HQ (with its site) or of the site (spec §11, diagram 8): every new image's signature checked and
 * the images fetched by digest before anything stops; then what is upgraded is stopped, a sealed backup taken, the
 * compose projects switched to the new pinned images, and HQ and the site given time to come up healthy. If they
 * do not, everything is put back — the previous images and the backup — and the outcome says so in words.
 *
 * What was there is written down before the switch (`underWay`), so an upgrade a restart cut short is finished, or
 * put back, by whatever runs next: the scheduler running it again, or the next upgrade.
 */
import type { Progress } from '../sockets/lineServer'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { product } from '../cli/words'
import { checkImages, fetchImages } from '../images/images'
import { exclusive, exclusiveWhenFree, takeBackup, type OnWait } from '../backups/take'
import { checkUpgrade, whoText, type Target } from './rules'
import { healthProblem } from './health'
import { putBack, startDatabases, startTarget, stopTarget, writeProjects } from './rollback'
import { readUpgrades, writeUpgrades, type UnderWay } from './settings'
import { PARTS_OF } from './versions'

export type UpgradeOutcome =
  | { version: string; rolledBack: false }
  /** `version` is the one running again; `reason` says what failed and what was put back. */
  | { version: string; rolledBack: true; reason: string }

type Report = (p: Progress) => void

async function step<T>(progress: Report, name: string, work: () => Promise<T>, outcome: (v: T) => string = () => 'done'): Promise<T> {
  progress({ event: 'step', step: name })
  const value = await work()
  progress({ event: 'stepDone', outcome: outcome(value) })
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

/** The health check of an upgrade under way; when it fails, everything is put back. */
async function settle(ctx: Context, u: UnderWay, progress: Report): Promise<UpgradeOutcome> {
  const problem = await step(progress, 'Health check', () => healthProblem(ctx, u.target, u.to), p => (p ? 'fails' : 'passes'))
  if (!problem) {
    writeUpgrades(ctx.state, s => {
      s.underWay = null
      s.rolledBack = s.rolledBack.filter(v => v !== `${u.target}@${u.to}`)
      s.last = { target: u.target, to: u.to, endedAt: ctx.now().toISOString(), rolledBack: false, reason: null }
    })
    return { version: u.to, rolledBack: false }
  }
  const who = whoText(ctx, u.target, true)
  const failed = `${who} did not pass its health check: ${problem}.`
  try {
    await step(progress, `Going back to ${u.from}`, () => putBack(ctx, u))
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    throw new Refusal('failed', `${failed} Putting it back failed too: ${why}. The backup from ${clock(u.backupTakenAt)} is on this machine. The host service tries again when it next upgrades or restarts.`)
  }
  const restored = u.target === 'hq' ? 'restored the backup' : 'restored the site from the backup'
  const reason = `${failed} The host service ${restored} from ${clock(u.backupTakenAt)}, and ${u.target === 'hq' ? 'HQ' : 'it'} is on ${u.from} again.`
  writeUpgrades(ctx.state, s => {
    s.underWay = null
    if (!s.rolledBack.includes(`${u.target}@${u.to}`)) s.rolledBack.push(`${u.target}@${u.to}`)
    s.last = { target: u.target, to: u.to, endedAt: ctx.now().toISOString(), rolledBack: true, reason }
  })
  return { version: u.from, rolledBack: true, reason }
}

/** Finishes, or puts back, an upgrade a restart cut short; null when none was under way. */
export function finishUnderWay(ctx: Context, progress: Report = () => {}): Promise<UpgradeOutcome | null> {
  if (!readUpgrades(ctx.state).underWay) return Promise.resolve(null)
  return whenFree(ctx, () => {}, async () => {
    const u = readUpgrades(ctx.state).underWay
    return u ? settle(ctx, u, progress) : null
  })
}

export function upgrade(
  ctx: Context, target: Target, version: string, progress: Report,
  opts: { onBusy?: OnWait } = {},
): Promise<UpgradeOutcome> {
  return whenFree(ctx, opts.onBusy ?? null, async () => {
    const pending = readUpgrades(ctx.state).underWay
    if (pending) {
      const settled = await settle(ctx, pending, progress)
      if (pending.target === target && pending.to === version) return settled
    }
    return run(ctx, target, version, progress)
  })
}

async function run(ctx: Context, target: Target, version: string, progress: Report): Promise<UpgradeOutcome> {
  const from = checkUpgrade(ctx, target, version)
  const paths = await ctx.machinePaths()
  if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine, so it cannot upgrade. Nothing was changed.')
  const parts = PARTS_OF[target]
  // Before anything stops: an image that fails its check, or cannot be fetched, leaves everything running as it was.
  const { pins } = await step(progress, `Checking the images are signed by ${product}`, () =>
    checkImages(ctx, parts.map(part => ({ part, version }))), () => 'passes')
  await step(progress, target === 'hq' ? `Pulling HQ ${version} and its site` : `Pulling the site ${version}`, () =>
    fetchImages(ctx, parts.map(part => pins[part]!)))

  const before = installed(ctx)
  const who = whoText(ctx, target, true)
  await step(progress, target === 'hq' ? 'Stopping HQ and its site' : 'Stopping the site', () => stopTarget(ctx, target))
  const backup = await step(progress, 'Taking a sealed backup', async () => {
    try {
      await startDatabases(ctx, target)
      return await takeBackup(ctx, 'beforeUpgrade')
    } catch (err) {
      await startTarget(ctx, target).catch(() => {})
      const why = err instanceof Error ? err.message : String(err)
      throw new Refusal('failed', `Not upgraded, since an upgrade takes a backup first: ${why.replace(/\.?$/, '.')} ${who} is started again on ${from}.`)
    }
  })

  const u: UnderWay = {
    target, to: version, from,
    hq: before.hq?.settings ?? null,
    site: before.site!.settings,
    backupId: backup.id,
    backupTakenAt: backup.takenAt,
  }
  writeUpgrades(ctx.state, s => { s.underWay = u })
  progress({ event: 'step', step: `Starting ${version}` })
  try {
    const hq = target === 'hq' && u.hq ? { ...u.hq, version, images: { 'hq-server': pins['hq-server'], 'hq-web': pins['hq-web'] } } : null
    await writeProjects(ctx, hq, { ...u.site, version, images: { 'site-server': pins['site-server'], agent: pins.agent } }, paths)
    await startTarget(ctx, target)
    progress({ event: 'stepDone', outcome: 'done' })
  } catch {
    // Compose refusing to start it fails the health check, which puts everything back.
    progress({ event: 'stepDone', outcome: 'fails' })
  }
  return settle(ctx, u, progress)
}
