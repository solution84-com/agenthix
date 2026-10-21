/**
 * The Docker actions that take an install off a machine (`agenthix uninstall`): removing a container, volume, network
 * or image by its name, and listing what is there to remove. Like `docker.ts`, each is an argument list the host
 * service builds itself, never through a shell. Each removal says how it went rather than throwing for what is
 * already gone, so a second run, or one after a partial run, removes what is left and fails on nothing it finds gone.
 */
import type { DockerRunner, RunResult } from './docker'

/** `inUse`: Docker refused, because a container uses it — for an image, one another install may run. */
export type Removal = 'removed' | 'absent' | 'inUse'

export class RemovalFailed extends Error {
  constructor(readonly what: string, result: RunResult) {
    super(`${what}: ${(result.stderr || result.stdout).trim().split('\n').pop() || `docker exited with ${result.code}`}`)
  }
}

const ABSENT = /no such|not found/i
const IN_USE = /in use|being used|is using|conflict/i

/** An image Docker holds, by its repository, and its digest when it was fetched from a registry. */
export type ImageRow = { repository: string; tag: string; digest: string | null }

export class DockerRemoval {
  constructor(private readonly run: DockerRunner) {}

  private async remove(args: string[], what: string): Promise<Removal> {
    const r = await this.run(args, { timeoutMs: 2 * 60_000 })
    if (r.code === 0) return 'removed'
    const said = `${r.stderr}\n${r.stdout}`
    if (ABSENT.test(said)) return 'absent'
    if (IN_USE.test(said)) return 'inUse'
    throw new RemovalFailed(what, r)
  }

  private async names(args: string[]): Promise<string[]> {
    const r = await this.run(args, { timeoutMs: 60_000 })
    if (r.code !== 0) throw new RemovalFailed(`docker ${args.slice(0, 2).join(' ')}`, r)
    return r.stdout.split('\n').map(n => n.trim()).filter(Boolean)
  }

  /** Stops it if it runs, then removes it. */
  container(name: string): Promise<Removal> {
    return this.remove(['rm', '--force', name], `The container ${name}`)
  }

  volume(name: string): Promise<Removal> {
    return this.remove(['volume', 'rm', name], `The volume ${name}`)
  }

  network(name: string): Promise<Removal> {
    return this.remove(['network', 'rm', name], `The network ${name}`)
  }

  /** Never forced: an image a container uses — any container, of any install — is left, and says `inUse`. */
  image(ref: string): Promise<Removal> {
    return this.remove(['image', 'rm', ref], `The image ${ref}`)
  }

  volumes(): Promise<string[]> {
    return this.names(['volume', 'ls', '--format', '{{.Name}}'])
  }

  networks(): Promise<string[]> {
    return this.names(['network', 'ls', '--format', '{{.Name}}'])
  }

  /** Every container's name, running or not. */
  containers(): Promise<string[]> {
    return this.names(['ps', '--all', '--format', '{{.Names}}'])
  }

  /** The containers of a group or compose project, running or not, by its `com.docker.compose.project` label. */
  group(project: string): Promise<string[]> {
    return this.names(['ps', '--all', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Names}}'])
  }

  groupNetworks(project: string): Promise<string[]> {
    return this.names(['network', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Name}}'])
  }

  async images(): Promise<ImageRow[]> {
    const rows = await this.names(['image', 'ls', '--digests', '--format', '{{.Repository}}\t{{.Tag}}\t{{.Digest}}'])
    return rows.map(row => {
      const [repository = '', tag = '', digest = ''] = row.split('\t')
      return { repository, tag, digest: /^sha256:[0-9a-f]{64}$/.test(digest) ? digest : null }
    })
  }
}
