/**
 * Whether Docker can publish a port, asked by publishing it from a throwaway container (one port plan, Rule 4). On
 * Docker Desktop the host service runs in Docker's virtual machine, with that machine's network, so a bind probe
 * cannot see a program listening on the computer itself; Docker publishes there, and refuses a port held there.
 * The container runs the host service's own image, which is always present, and exits at once.
 */
import type { RunResult } from './docker'

/** The port inside the throwaway container; nothing listens on it, since the container exits at once. */
const INSIDE = 9

/** What Docker says when the port is held on the machine it publishes on, or by another container. */
const HELD = /address already in use|ports are not available|port is already allocated/i

export function publishArgs(image: string, port: number, bind: string): string[] {
  const host = bind.includes(':') ? `[${bind}]` : bind
  return ['run', '--rm', '--pull', 'never', '-p', `${host}:${port}:${INSIDE}`, '--entrypoint', 'true', image]
}

/** False when it published, true when Docker says the port is held, null when Docker could not run the probe. */
export function readPublishProbe(r: RunResult): boolean | null {
  if (r.code === 0) return false
  return HELD.test(r.stderr) ? true : null
}
