// The containers and networks the run's sites made, removed at teardown. A site labels everything it makes with its
// own id (`<namespace>.site=<id>`) and sweeps only that id, and this run's site takes a new id whenever a suite resets
// its identity, so what an earlier id made would outlive the run. Each id is recorded when the site comes up, in a
// file under the run's folder (written by globalSetup and the test-file worker alike), and teardown removes what
// carries any of them. Matching the id itself, never a namespace, leaves a developer's own site and any installed
// copy alone.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_ROOT_DIR } from './env'
import { labelledWith } from './siteLabels'

const RECORD = join(SITE_ROOT_DIR, 'site-ids')
const SITE_ID = /^[A-Za-z0-9_.-]{1,64}$/

export function recordSiteId(siteId: string): void {
  if (SITE_ID.test(siteId)) appendFileSync(RECORD, `${siteId}\n`)
}

export function recordedSiteIds(): string[] {
  if (!existsSync(RECORD)) return []
  return [...new Set(readFileSync(RECORD, 'utf8').split('\n').filter(id => SITE_ID.test(id)))]
}

function docker(args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 })
  return { ok: r.status === 0, out: r.stdout ?? '' }
}

/** Removes the containers, then the networks, the given sites made. Never throws: a teardown that fails to tidy fails nothing. */
export function removeSiteLeftovers(siteIds: readonly string[]): void {
  if (siteIds.length === 0) return
  const format = '{{.ID}}\t{{.Labels}}'
  const containers = docker(['ps', '-a', '--no-trunc', '--format', format])
  if (!containers.ok) return // no Docker here: the run made nothing in it
  const leftContainers = labelledWith(containers.out, siteIds)
  if (leftContainers.length) docker(['rm', '-f', ...leftContainers])
  const leftNetworks = labelledWith(docker(['network', 'ls', '--no-trunc', '--format', format]).out, siteIds)
  for (const id of leftNetworks) docker(['network', 'rm', id])
  const after = labelledWith(docker(['ps', '-a', '--no-trunc', '--format', format]).out, siteIds).length
    + labelledWith(docker(['network', 'ls', '--no-trunc', '--format', format]).out, siteIds).length
  if (after > 0) console.warn(`[harness] ${after} container(s) or network(s) the run's sites made could not be removed`)
}
