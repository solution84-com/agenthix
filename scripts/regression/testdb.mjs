// The regression's own database server: a throwaway PostgreSQL container started for the run and removed when it ends,
// so the suites never share the development server, and never slow each other down on it. Every suite's test databases
// go to it through TEST_DB_SERVER_URL, which the test-database wrappers, the cross-app harness and the stacks read
// before the development address in each app's .env.server.
//
// Set up for tests, as CI's service container is: its data is never flushed to disk (fsync, synchronous commit and
// full-page writes off, and the least write-ahead log), so it lives in the page cache; it has more buffer memory than
// the development server, and room for the connections of every suite running at once. Its data is on the container's
// own volume, removed with it: in memory (tmpfs) a full run's databases outgrew 3 GB and the server stopped (closeout-7,
// 13 Nov). A crash loses it, which costs nothing: the next run makes a new one.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const IMAGE = 'postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea'
const PREFIX = 'regression-test-db-'
export const SETTINGS = {
  fsync: 'off', synchronous_commit: 'off', full_page_writes: 'off', shared_buffers: '512MB', max_connections: '300',
  wal_level: 'minimal', max_wal_senders: '0', max_wal_size: '1GB', checkpoint_timeout: '30min',
}

/** The `docker run` arguments for the server named `name`, with `password`. */
export function runArgs(name, password, containerPort) {
  return [
    'run', '-d', '--rm', '--name', name,
    '-e', 'POSTGRES_USER=regression', '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=postgres',
    '-p', `127.0.0.1::${containerPort}`,
    IMAGE, 'postgres', ...Object.entries(SETTINGS).flatMap(([k, v]) => ['-c', `${k}=${v}`]),
  ]
}

/** The host port `docker port` gives for the container's port: `127.0.0.1:55012` → 55012. */
export function hostPort(text) {
  const m = /:(\d+)\s*$/m.exec(text.trim().split('\n')[0] ?? '')
  if (!m) throw new Error(`no published port in "${text.trim()}"`)
  return Number(m[1])
}

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

/**
 * Starts the run's server and waits until it takes connections; returns { url, stop }. `url` is the server's address
 * with the admin database in its path. A server left by a run that was killed outright is removed first.
 */
export async function startTestDatabase({ root, docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), say = () => {}, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  for (const left of docker(['ps', '-a', '--filter', `name=^${PREFIX}`, '--format', '{{.Names}}']).split('\n').filter(Boolean)) {
    const pid = Number(left.slice(PREFIX.length))
    if (pid && !alive(pid)) docker(['rm', '-f', left])
  }
  const { CONTAINER_DATABASE_PORT } = await import(pathToFileURL(join(root, 'core/dist/index.js')).href)
  const name = `${PREFIX}${process.pid}`
  const password = randomBytes(18).toString('base64url')
  docker(runArgs(name, password, CONTAINER_DATABASE_PORT))
  const stop = () => {
    try {
      docker(['rm', '-f', name])
    } catch { /* already gone */ }
  }
  try {
    const port = hostPort(docker(['port', name, `${CONTAINER_DATABASE_PORT}/tcp`]))
    // Ready when it answers over TCP: the image's first start runs its set-up on a socket only, then restarts.
    for (let i = 0; ; i++) {
      try {
        docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'regression', '-q'])
        break
      } catch {
        if (i >= 120) throw new Error(`the test database server ${name} did not start in a minute`)
        await wait(500)
      }
    }
    say(`test database server ${name} on 127.0.0.1:${port} (${Object.entries(SETTINGS).map(([k, v]) => `${k}=${v}`).join(' ')})`)
    return { url: `postgresql://regression:${password}@127.0.0.1:${port}/postgres`, name, stop }
  } catch (err) {
    stop()
    throw err
  }
}
