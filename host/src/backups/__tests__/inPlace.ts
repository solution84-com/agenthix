/**
 * One machine for the in-place restore tests (`*InPlace.container.test.ts`, with HOST_E2E=1): the host service's
 * image run as the documented container `<namespace>-host`, on a state folder of its own whose namespace — the test's
 * own for the run (`testNamespace`) — is recorded before the first start, so every compose project, container, volume
 * and network the test makes carries that namespace. Every docker command goes through the guard
 * (`containerGuard.ts`), so nothing else on the machine is touched. Requests go to the owner socket as the Fleet
 * Console's do, from inside the container.
 *
 * The state folder is a Docker volume's own folder, bound by its path as a machine's folder is. On Docker Desktop a
 * folder shared from the Mac keeps no file ownership, and the site's data folder must keep it, as it does on Linux:
 * the site starts on a data folder that holds files only when it is the site user's.
 */
import { ADDRESS_BLOCKS } from '@agenthix/core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { composeJson } from '../../compose/projects'
import { imageRef } from '../../images/published'
import { makeSiteCredential, siteComposeProject } from '../../install/siteCompose'
import type { StoredSite } from '../../service/context'
import { StateFolder } from '../../state/folder'
import { installSecrets } from '../../state/secrets'
import { claimNames, guardedDocker, type GuardedDocker } from '../../__tests__/containerGuard'
import { machineSubnets } from '../../__tests__/containerSubnets'

/** The agent slice a seeded site's installation records: a /20 of the tests' block, clear of every installation's own. */
const SLICE = `${ADDRESS_BLOCKS.tests.split('.').slice(0, 2).join('.')}.224.0/20`

export const IMAGE = process.env.HOST_IMAGE || 'agenthix-host'

export const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Reads one request from stdin, sends it to the owner socket, and prints every line of the answer. */
const ASK = `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=require('net').createConnection('/run/host/owner.sock');` +
  `c.setEncoding('utf8');let o='';c.on('connect',()=>c.write(s.trim()+'\\n'));c.on('data',d=>o+=d);c.on('end',()=>process.stdout.write(o))})`

export type Answer = { ok: true; result: Record<string, unknown> } | { ok: false; refusal: { code: string; message: string } }
export type Listed = { id: string; night: string; takenAt: string; kind: string; holds: string[]; onMachine: boolean }

export class Machine {
  readonly names
  readonly volume: string
  /** The state folder's path on the machine: what the host service binds as `/state`, and compose binds from. */
  readonly state: string
  /** docker, refusing anything outside this machine's namespace. */
  readonly docker: GuardedDocker

  private readonly namespace: string

  constructor(namespace: string, readonly name: string) {
    this.names = claimNames(namespace)
    this.docker = guardedDocker(namespace)
    const docker = this.docker
    this.volume = `${namespace}-e2e-state`
    docker('volume', 'create', this.volume)
    this.state = docker('volume', 'inspect', '-f', '{{.Mountpoint}}', this.volume).trim()
    this.namespace = namespace
    this.write('installation.json', this.installationJson(null))
    this.write('machine.json', JSON.stringify({ name }))
  }

  private installationJson(agentRange: string | null): string {
    return JSON.stringify({ namespace: this.namespace, ports: { hq: null, console: null }, agentRange, recordedAt: new Date().toISOString() })
  }

  async start(): Promise<void> {
    this.docker('run', '-d', '--name', this.names.hostContainer, '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', `${this.state}:/state`,
      '-v', `${this.names.hostFiguresVolume}:/run/host-figures`, '--network', 'host', IMAGE)
    for (let i = 0; i < 100; i++) {
      try {
        this.docker('exec', this.names.hostContainer, 'test', '-S', '/run/host/owner.sock')
        return
      } catch {
        await pause(200)
      }
    }
    throw new Error('the host service did not open its owner socket')
  }

  ask(request: object): Answer {
    const out = this.docker.with({ input: JSON.stringify(request) }, 'exec', '-i', this.names.hostContainer, 'node', '-e', ASK)
    return JSON.parse(out.trim().split('\n').pop()!) as Answer
  }

  /** The request must pass; its result. */
  must(request: object): Record<string, unknown> {
    const a = this.ask(request)
    if (!a.ok) throw new Error(`${JSON.stringify(request)} was refused: ${a.refusal.message}`)
    return a.result
  }

  cli(input: string, ...args: string[]): { code: number; text: string } {
    try {
      return { code: 0, text: this.docker.with({ input }, 'exec', '-i', this.names.hostContainer, 'agenthix', ...args) }
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string }
      return { code: e.status ?? 1, text: `${e.stdout ?? ''}${e.stderr ?? ''}` }
    }
  }

  backups(): Listed[] {
    return this.must({ op: 'backup.list' }).backups as Listed[]
  }

  takeBackup(): string {
    return (this.must({ op: 'backup.take' }).backup as { id: string }).id
  }

  /** What the Fleet Console's Restore… sends for a night kept on the machine. */
  restore(target: 'hq' | 'site', backupId: string): Answer {
    return this.ask({ op: 'backup.restore', target, source: { from: 'machine', backupId } })
  }

  psql(service: 'hq-db' | 'site-db', sql: string): string {
    const db = service === 'hq-db' ? this.names.hqDatabase : this.names.siteDatabase
    return this.docker('exec', this.names.container(service), 'psql', '-U', 'postgres', '-d', db, '-tAc', sql).trim()
  }

  async databaseReady(service: 'hq-db' | 'site-db'): Promise<void> {
    for (let i = 0; i < 120; i++) {
      try {
        this.psql(service, 'select 1')
        return
      } catch {
        await pause(1000)
      }
    }
    throw new Error(`${service} did not answer`)
  }

  /** Until the server has applied its migrations and keeps running: nothing else may write to its database first. */
  async siteReady(): Promise<void> {
    await this.databaseReady('site-db')
    for (let i = 0; i < 180; i++) {
      let applied = false
      try {
        applied = this.psql('site-db', 'select count(*) > 0 and bool_and(finished_at is not null) from _prisma_migrations') === 't'
      } catch { /* not made yet */ }
      if (applied && this.running(this.names.siteContainer)) {
        await pause(3000)
        if (this.running(this.names.siteContainer)) return
      }
      await pause(1000)
    }
    throw new Error(`the site did not start: ${execFileSync('sh', ['-c', `docker logs --tail 20 ${this.names.siteContainer} 2>&1`], { encoding: 'utf8' })}`)
  }

  running(container: string): boolean {
    try {
      return this.docker('inspect', '-f', '{{.State.Running}} {{.State.Restarting}}', container).trim() === 'true false'
    } catch {
      return false
    }
  }

  /** Runs a shell line on the state folder, mounted at /s, as root. */
  onState(script: string, input?: string): string {
    return this.docker.with({ input: input ?? '' }, 'run', '--rm', '-i', '-v', `${this.volume}:/s`, '--entrypoint', 'sh', IMAGE, '-c', script)
  }

  /** A file of the state folder as it is now, or null when there is none. */
  file(rel: string): string | null {
    const out = this.onState(`if [ -f "/s/${rel}" ]; then echo y; cat "/s/${rel}"; else echo n; fi`)
    return out.startsWith('y\n') ? out.slice(2) : null
  }

  write(rel: string, content: string): void {
    this.onState(`mkdir -p "$(dirname "/s/${rel}")" && cat > "/s/${rel}" && chmod 600 "/s/${rel}"`, content)
  }

  /**
   * A site a Fleet Console added, as `installManagedSite` writes it and starts it: named after the machine, its own
   * credential, at the host service's development version. Its HQ is not reachable here, so it runs unconnected,
   * which a restore in place does not need. Its installation records an agent slice, as a site's install does, because
   * a site's compose file is not written without one.
   */
  seedSite(installedAt: string): void {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-in-place-seed-'))
    try {
      const local = new StateFolder(tmp)
      local.writePrivate(['installation.json'], this.installationJson(SLICE))
      const secrets = this.file('secrets.json')
      if (secrets) local.writePrivate(['secrets.json'], secrets)
      const site: StoredSite = {
        name: this.name, version: 'dev', hqUrl: 'http://hq.invalid', installedAt,
        images: { 'site-server': imageRef('site-server', 'dev'), agent: imageRef('agent', 'dev'), executor: imageRef('executor', 'dev') },
      }
      makeSiteCredential(local, new Date())
      const made = installSecrets(local)
      local.writeJson(['site', 'settings.json'], site)
      local.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(local, this.names, site, made, { state: this.state }, machineSubnets(this.docker, this.names))))
      for (const rel of ['installation.json', 'secrets.json', 'site/credential.json', 'site/settings.json', 'site/compose.json']) {
        this.write(rel, fs.readFileSync(path.join(tmp, rel), 'utf8'))
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
    this.docker('exec', this.names.hostContainer, 'docker', 'compose', '-p', this.names.siteProject, '-f', '/state/site/compose.json', 'up', '-d')
  }

  /** The site taken away with its database and data, as an erase leaves the machine, its backups kept. */
  removeSite(): void {
    this.docker('compose', '-p', this.names.siteProject, 'down', '-v')
    this.onState('rm -rf /s/site')
  }

  /** Everything this machine made, gone: its container, its compose projects with their volumes and networks. */
  cleanUp(): void {
    const quiet = this.docker.quiet
    quiet('rm', '-f', this.names.hostContainer)
    // HQ's project last: the site and the Fleet Console join its link network, which goes with it.
    for (const p of [this.names.siteProject, this.names.consoleProject, this.names.hqProject]) quiet('compose', '-p', p, 'down', '-v')
    // By name, which the guard checks carries the namespace, never by an id it cannot.
    const agents = this.docker('ps', '-a', '--format', '{{.Names}}', '--filter', `label=com.docker.compose.project=${this.names.agentsProject}`)
      .split('\n').filter(Boolean)
    for (const name of agents) quiet('rm', '-f', name)
    quiet('volume', 'rm', this.names.hostFiguresVolume)
    quiet('volume', 'rm', this.volume)
  }
}
