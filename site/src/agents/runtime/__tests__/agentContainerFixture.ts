/**
 * Set-up shared by the container tests that run a real `claude` process in the agent image: the stand-in Anthropic
 * API on this machine, and one capped container with a home, a project and the run staging mounted.
 */
import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const AGENT_IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
export const agentImagePresent = (): boolean => spawnSync('docker', ['image', 'inspect', AGENT_IMAGE], { stdio: 'ignore' }).status === 0
export const docker = async (...args: string[]): Promise<string> => (await run('docker', args, { timeout: 60_000 })).stdout

/** The stand-in Anthropic API (fixtures/standinAnthropic.mjs), its log and every request body in `dir`. */
export async function startStandinAnthropic(dir: string): Promise<{ port: string; child: ChildProcess }> {
  const child = spawn('node', [fileURLToPath(new URL('./fixtures/standinAnthropic.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', HOST: '0.0.0.0', LOG: path.join(dir, 'anthropic.jsonl'), BODY_LOG: path.join(dir, 'bodies.jsonl') },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const port = await new Promise<string>((resolve, reject) => {
    child.stdout!.once('data', (d: Buffer) => resolve(d.toString().trim()))
    child.once('exit', () => reject(new Error('the stand-in Anthropic API exited')))
  })
  return { port, child }
}

/**
 * One container, capped at 2 GB and 2 CPUs, reaching this machine as host.docker.internal: `dir`'s home, project and
 * run staging mounted where a run's are. Any container left by the same name is removed first.
 */
export async function startAgentContainer(name: string, dir: string): Promise<void> {
  await fs.mkdir(path.join(dir, 'home', '.claude'), { recursive: true })
  await fs.writeFile(path.join(dir, 'home', '.claude.json'), '{}')
  await fs.mkdir(path.join(dir, 'project', 'files'), { recursive: true })
  await fs.mkdir(path.join(dir, 'run-staging', 'skills'), { recursive: true })
  await fs.mkdir(path.join(dir, 'run-staging', 'pinned-memory'), { recursive: true })
  await docker('rm', '-f', name).catch(() => '')
  await docker('run', '-d', '--init', '--memory', '2g', '--cpus', '2', '--pids-limit', '4096', '--name', name,
    '--add-host', 'host.docker.internal:host-gateway',
    '-v', `${path.join(dir, 'home')}:/home/appuser`, '-v', `${path.join(dir, 'project')}:/projects/p1`,
    '-v', `${path.join(dir, 'run-staging')}:/run/staging:ro`,
    AGENT_IMAGE, 'tail', '-f', '/dev/null')
}
