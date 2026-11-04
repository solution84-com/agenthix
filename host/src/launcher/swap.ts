/**
 * What the launcher does (ADR-0118): replaces the host service's container with one from the new image, started
 * with the recorded settings, and keeps the old one until the new one answers as its version — or puts the old one
 * back. It runs only the image the host service checked and wrote down, and only forward; a development build only an
 * image built on the machine (`built.ts`), which has no version to go forward from.
 *
 * At every step one host service can run on the machine: the old one is stopped before the new one starts (two
 * would both run the machine's schedule), and it is kept, stopped and named `<namespace>-host-previous`, until the new one
 * answers. Each step is written down before it is taken, so a launcher started again (Docker restarts it with the
 * machine) carries on from what it finds rather than starting over.
 */
import type { ContainerOps } from '../docker/containers'
import type { StateFolder } from '../state/folder'
import type { InstallNames } from '../state/namespace'
import { isPublishedVersion, versionedRef } from '../images/published'
import { DEVELOPMENT } from '../images/ownVersion'
import { compare } from '../upgrades/versions'
import { builtRefusal } from './built'
import { ENDED, endSwitch, readSwitch, writeSwitch, type HostSwitch } from './journal'
import { hostSpec, readRecord } from './record'

export type LauncherEnv = {
  containers: ContainerOps
  state: StateFolder
  /** The names derived from the install's recorded namespace: the host service's container among them. */
  names: InstallNames
  /** The version recorded for the image the launcher runs from (`images/ownVersion.ts`): the host service it replaces. */
  ownVersion: string
  now: () => Date
  sleep: (ms: number) => Promise<void>
  pollMs: number
}

/** A launcher taken up this many times without ending puts the old host service back. */
const MAX_ATTEMPTS = 5
const PINNED = /^[a-z0-9][a-z0-9./_-]*@sha256:[0-9a-f]{64}$/

/** How the new host service is asked its version: the same command in every version's image, run inside it. */
export const ANSWER_COMMAND = ['node', '/app/dist/launcher.js', 'answer']

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/\.?$/, '')
const minutes = (ms: number) => `${Math.round(ms / 60_000)} minute${Math.round(ms / 60_000) === 1 ? '' : 's'}`

/** A published host service's switch: only an image it checked against its signature, and only forward. */
function publishedRefusal(own: string, s: HostSwitch): string | null {
  if (!s.checked || !PINNED.test(s.ref)) return `The image ${s.ref} was not checked against its signature by the host service.`
  if (!isPublishedVersion(own)) return `This host service is a development build (${own}): it switches only to an image built on this machine, not to a published version.`
  if (s.from !== own) return `The launcher is ${own}, not the host service ${s.from} it would replace.`
  if (!isPublishedVersion(s.to) || compare(s.to, own) <= 0) return `The host service is on ${own}, and ${s.to} is not newer: a switch only goes forward.`
  return null
}

/** A development build's switch to an image built on the machine (`built.ts`): no signature, no version order. */
function builtSwitchRefusal(own: string, s: HostSwitch): string | null {
  if (isPublishedVersion(own)) return `This host service is ${own}, a published version: it switches only forward, to an image signed for a newer version, never to one built on this machine.`
  if (s.from !== DEVELOPMENT || s.to !== DEVELOPMENT || own !== DEVELOPMENT) return 'The switch was not written for a development build.'
  return null
}

/** Why the launcher will not take this switch up; null when it will. */
async function refusal(env: LauncherEnv, s: HostSwitch, imageId: string): Promise<string | null> {
  if (s.imageId !== imageId) return `The launcher was given ${imageId}, not the image the host service checked.`
  const problem = s.built ? builtSwitchRefusal(env.ownVersion, s) : publishedRefusal(env.ownVersion, s)
  if (problem) return problem
  const image = await env.containers.image(imageId)
  if (!image || image.id !== imageId) return `The image ${s.ref} is not on this machine.`
  const record = readRecord(env.state)
  if (!record || record.containerId !== s.oldContainer) return 'The settings the host service runs with are not recorded.'
  const host = env.names.hostContainer
  const old = await env.containers.inspect(s.oldContainer)
  if (!old || old.name !== host || !old.running) return `The host service to replace is not running as ${host}.`
  return s.built ? builtRefusal(s.ref, image, old.image) : null
}

/** The new host service, as the words about the switch name it. */
const newOne = (s: HostSwitch) => (s.built ? `from ${s.ref}` : s.to)

/**
 * Starts the new host service under the host service's name, with the old one stopped and set aside first. It is
 * started by `<repository>:<to>@sha256:…`: the digest the signature for `to` covers, and the tag it learns its version
 * from (`images/ownVersion.ts`). An image built on the machine is started by its id, so it runs exactly the image the
 * switch was written for, and is a development build too.
 */
async function bringUpNew(env: LauncherEnv, s: HostSwitch): Promise<HostSwitch> {
  const c = env.containers
  const { hostContainer: host, previousHostContainer: previous } = env.names
  const waitingFrom = (s: HostSwitch, since: string | null): HostSwitch =>
    s.waitingSince && since === s.waitingSince ? s : writeSwitch(env.state, { ...s, waitingSince: since ?? env.now().toISOString() })
  const current = await c.inspect(host)
  if (current && current.id !== s.oldContainer) {
    if (current.image !== s.imageId) throw new Error(`another container is named ${host}`)
    if (!current.running) await c.start(current.id)
    // A launcher started again waits no longer than the first would have.
    return waitingFrom(s, s.waitingSince)
  }
  const old = await c.inspect(s.oldContainer)
  if (old) {
    if (old.running) await c.stop(old.id)
    if (old.name !== previous) {
      const stale = await c.inspect(previous)
      if (stale && stale.id !== old.id) await c.remove(stale.id)
      await c.rename(old.id, previous)
    }
  }
  const record = readRecord(env.state)
  if (!record) throw new Error('the settings the host service runs with are not recorded')
  await c.run(hostSpec(record, s.built ? s.imageId : versionedRef(s.ref, s.to), env.names))
  return waitingFrom(s, null)
}

async function versionAnswered(c: ContainerOps, host: string): Promise<string | null> {
  const r = await c.exec(host, ANSWER_COMMAND, 20_000)
  if (r.code !== 0) return null
  try {
    const v = (JSON.parse(r.stdout.trim().split('\n').pop() ?? '') as { version?: unknown }).version
    return typeof v === 'string' ? v : null
  } catch {
    return null
  }
}

/** Null once the new host service, from the image the switch was written for, answers as its version; otherwise why it is put back. */
async function waitForAnswer(env: LauncherEnv, s: HostSwitch): Promise<string | null> {
  const since = Date.parse(s.waitingSince ?? env.now().toISOString())
  for (;;) {
    const version = await versionAnswered(env.containers, env.names.hostContainer)
    if (version === s.to) {
      const now = await env.containers.inspect(env.names.hostContainer)
      return now?.image === s.imageId ? null : `The host service that answered does not run ${s.ref}.`
    }
    if (version !== null) return `The new host service answered as ${version}, not ${s.to}.`
    if (env.now().getTime() - since >= s.answerWithinMs) return `The new host service ${newOne(s)} did not answer within ${minutes(s.answerWithinMs)}.`
    await env.sleep(env.pollMs)
  }
}

/** Removes the new host service and starts the old one again under its own name. */
async function putBack(env: LauncherEnv, s: HostSwitch, why: string): Promise<HostSwitch> {
  const c = env.containers
  const { hostContainer: host, previousHostContainer: previous } = env.names
  s = writeSwitch(env.state, { ...s, phase: 'puttingBack', reason: why })
  // Only "no such container" is gone; a Docker error is asked again, then handed to the person with the commands.
  let old: Awaited<ReturnType<ContainerOps['inspect']>> = null
  for (let tries = 1; ; tries++) {
    try {
      old = await c.inspect(s.oldContainer)
      break
    } catch (err) {
      if (tries >= 3) {
        const by = `docker rm -f ${host} && docker rename ${previous} ${host} && docker start ${host}`
        return endSwitch(env.state, s, 'failed', `${why} Docker did not say whether the host service ${s.from} is still there (${message(err)}). To start it, in this machine's own shell: ${by}`, env.now())
      }
      await env.sleep(5_000)
    }
  }
  if (!old) return endSwitch(env.state, s, 'failed', `${why} The host service it replaced is gone, so the new one is left as it is.`, env.now())
  let renamed = old.name === host
  try {
    const current = await c.inspect(host)
    if (current && current.id !== old.id) await c.remove(current.id)
    if (!renamed) await c.rename(old.id, host)
    renamed = true
    for (let tries = 1; ; tries++) {
      try {
        await c.start(old.id)
        break
      } catch (err) {
        if (tries >= 3) throw err
        await env.sleep(5_000)
      }
    }
  } catch (err) {
    const by = renamed ? `docker start ${host}` : `docker rm -f ${host} && docker rename ${previous} ${host} && docker start ${host}`
    return endSwitch(env.state, s, 'failed', `${why} The host service ${s.from} could not be started again either (${message(err)}). To start it, in this machine's own shell: ${by}`, env.now())
  }
  return endSwitch(env.state, s, 'failed', `${why} The host service ${s.from} was started again, as it was.`, env.now())
}

/** Takes the switch the host service wrote down as far as it goes, and says how it ended. */
export async function runSwitch(env: LauncherEnv, imageId: string): Promise<HostSwitch> {
  const written = readSwitch(env.state)
  if (!written) {
    const now = env.now().toISOString()
    return {
      from: env.ownVersion, to: '', ref: '', imageId, checked: false, oldContainer: '', answerWithinMs: 0, startedAt: now,
      phase: 'refused', attempts: 0, waitingSince: null, endedAt: now, reason: 'The host service wrote down no switch. Nothing was changed.',
    }
  }
  if (ENDED.has(written.phase)) return written
  if (written.imageId !== imageId) return { ...written, phase: 'refused', reason: `The launcher was given ${imageId}, not the image the host service checked.` }
  if (written.phase === 'ready') {
    let problem: string | null
    try {
      problem = await refusal(env, written, imageId)
    } catch (err) {
      // Docker failing on the first look ends the switch, so a launcher Docker restarts does not begin again for ever.
      return endSwitch(env.state, written, 'failed', `Docker did not answer the launcher's first check (${message(err)}). Nothing was changed.`, env.now())
    }
    if (problem) return endSwitch(env.state, written, 'refused', `${problem} Nothing was changed.`, env.now())
  }
  let s = writeSwitch(env.state, { ...written, phase: written.phase === 'puttingBack' ? 'puttingBack' : 'switching', attempts: written.attempts + 1 })
  if (s.phase === 'puttingBack') return putBack(env, s, s.reason ?? 'A launcher stopped while putting the host service back.')
  if (s.attempts > MAX_ATTEMPTS) return putBack(env, s, `The launcher stopped partway ${MAX_ATTEMPTS} times.`)
  try {
    s = await bringUpNew(env, s)
  } catch (err) {
    return putBack(env, s, `The new host service could not be started: ${message(err)}.`)
  }
  const problem = await waitForAnswer(env, s)
  if (problem) return putBack(env, s, problem)
  const old = await env.containers.inspect(s.oldContainer).catch(() => null)
  if (old) await env.containers.remove(old.id).catch(() => {})
  return endSwitch(env.state, s, 'done', null, env.now())
}
