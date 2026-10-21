/**
 * The one program that reaches a preview's port, and the only way anything in
 * this repository reaches one.
 *
 * A preview listens on a port INSIDE the boundary's container, bound to
 * loopback. Nothing outside that container can open a socket to it: no host
 * port is published, and publishing one would mean a container started with
 * preview-shaped parameters, which is the thing a preview must never be. So
 * the way in is a process the site starts inside the container, which opens
 * the loopback socket there and copies bytes between it and its own stdio —
 * and `docker exec` carries that stdio back across.
 *
 * The readiness probe and the byte-stream handler use the SAME script. They
 * ask different questions of it and get them from one mechanism:
 *
 *  - Without `-i`, `docker exec` gives the process no stdin. The relay
 *    connects, reads an immediate end-of-input, closes and exits 0 — so an
 *    exit status alone answers "is the port open yet". A refused connection
 *    exits 1.
 *  - With `-i`, the same process is a bidirectional pipe for as long as the
 *    caller holds it open.
 *
 * One constant rather than two command strings, because a probe that tested a
 * different path from the one the traffic later takes would report a preview
 * ready that nobody can reach.
 *
 * Written against `node`, which the agent image is built on — it is a
 * `node:22-alpine` derivative, so the interpreter is the one thing guaranteed
 * to be there. The port arrives as an argument rather than being pasted into
 * the source: a value interpolated into a program is a value that has to be
 * escaped, and this one comes off a wire.
 */

/**
 * Copies bytes between stdio and 127.0.0.1:<port> inside the container.
 *
 * Exit codes are the probe's whole answer, so they are deliberate: 0 the
 * connection was made and then ended, 1 it was refused or broke, 2 the port
 * argument was not a port. Anything non-zero means "not ready".
 */
export const PREVIEW_RELAY_SCRIPT = `
const net = require('net')
const port = Number(process.argv[1])
if (!Number.isInteger(port) || port < 1 || port > 65535) process.exit(2)
const sock = net.connect(port, '127.0.0.1')
sock.on('connect', () => { process.stdin.pipe(sock); sock.pipe(process.stdout) })
sock.on('error', () => process.exit(1))
sock.on('close', () => process.exit(0))
process.stdin.on('end', () => sock.end())
`.trim()

/**
 * The argv tail for `docker exec <container> …` that runs the relay against
 * `port`. Both callers take it from here so neither assembles a command of
 * its own and drifts from the other.
 */
export function previewRelayArgs(port: number): string[] {
  return ['node', '-e', PREVIEW_RELAY_SCRIPT, String(port)]
}
