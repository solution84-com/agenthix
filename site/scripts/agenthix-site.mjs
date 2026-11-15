#!/usr/bin/env node
// site/scripts/agenthix-site.mjs
//
// The site's command on its own machine (ADR-0065). It talks to the
// running site over its control socket; being able to reach that socket is the
// proof that the person running it controls the machine.
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = `Usage:
  agenthix-site status              Say whether this site is connected to HQ, and if not, why
  agenthix-site unregister          Take this site out of its HQ (not HQ's own site, which cannot leave)`

export function parseArgs(argv) {
  const [command] = argv
  if (command === 'status' || command === 'unregister') return { command }
  return null
}

export function resolveSiteRoot(env, envFileText, home) {
  let raw = env.SITE_ROOT
  if (!raw && envFileText) {
    const m = /^SITE_ROOT=(.*)$/m.exec(envFileText)
    if (m) raw = m[1].trim()
  }
  if (!raw) return null
  return raw.startsWith('~/') ? path.join(home, raw.slice(2)) : raw
}

export function resolveSocketPath(env, envFileText, home) {
  if (env.SITE_CONTROL_SOCKET) return env.SITE_CONTROL_SOCKET.trim()
  const root = resolveSiteRoot(env, envFileText, home)
  return root ? path.join(root, 'run', 'control.sock') : null
}

// Why the site is not connected, from the site's closed set of causes, each with what to do next.
const PROBLEMS = {
  secretTooShort: 'Its pairing secret (HQ_PAIRING_SECRET) is shorter than HQ accepts, so it did not try to connect. Set the same secret of at least 32 characters for HQ and the site, then restart the site.',
  addressRefused: "It would not send its credential to the address it was given for HQ, which is plain http outside this machine and a private network. Give HQ's https:// address, then restart the site.",
  credentialStore: 'It cannot keep its credential: SECRETS_MASTER_KEY is missing or not the one it was stored with. Set it, then restart the site.',
  credentialRefused: "HQ no longer accepts this site's credential: it was removed or replaced in HQ. A fleet admin adds this site again in the Fleet Console.",
  versionMismatch: 'HQ and this site run versions that do not work together, so HQ does not accept it. Upgrade the one that is behind; it reconnects by itself.',
  unreachable: "HQ does not answer at its address. Check HQ is running and this machine can reach it; the site reconnects by itself.",
}

export function formatStatus(s) {
  const lines = [`Site:       ${s.siteId}`]
  if (!s.hq) {
    const why = s.problem && PROBLEMS[s.problem]
    if (s.pairedBySecret) lines.push(`HQ:         Not connected. ${why ?? "It did not pair with HQ at this start; the site's log says why."}`)
    else lines.push('HQ:         Not connected to an HQ. A fleet admin adds this site in the Fleet Console.')
    return lines.join('\n')
  }
  lines.push(`HQ:         ${s.hq.url}`)
  if (s.hq.connected) {
    lines.push('Status:     Connected')
    if (s.hq.connectedAt) lines.push(`Since:      ${new Date(s.hq.connectedAt).toLocaleString()}`)
    return lines.join('\n')
  }
  const why = (s.problem && PROBLEMS[s.problem]) ?? 'Connecting. If it is not connected in a minute, the site\'s log says why.'
  lines.push(`Status:     Not connected. ${why}`)
  if (s.hq.lastError) lines.push(`Seen:       ${s.hq.lastError}`)
  return lines.join('\n')
}

const LEFT = {
  left: 'Unregistered. hq has taken this site out.',
  alreadyRemoved: 'Unregistered. HQ had already taken this site out; this machine has now forgotten HQ too.',
  unreachable: 'Unregistered here. HQ could not be reached, so it still lists this site, as not connected, until it is removed in HQ.',
  failed: 'Unregistered here. HQ did not accept the request to leave, so it still lists this site, as not connected, until it is removed in HQ.',
  notAsked: 'Unregistered here. This site held no credential it could use to tell HQ, so HQ still lists it, as not connected, until it is removed in HQ.',
}

export function formatReply(reply) {
  switch (reply.type) {
    case 'status':
      return { out: formatStatus(reply.status), failed: false }
    case 'unregistered':
      return { out: LEFT[reply.hq] ?? (reply.toldHq ? LEFT.left : LEFT.notAsked), failed: false }
    case 'error':
      return { err: reply.message, failed: true }
    default:
      return { err: 'The site sent an unreadable reply.', failed: true }
  }
}

function send(socketPath, request, onReply) {
  return new Promise((resolve, reject) => {
    let buf = ''
    const conn = net.createConnection(socketPath, () => conn.write(JSON.stringify(request) + '\n'))
    conn.on('data', d => {
      buf += d.toString()
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        let reply
        try {
          reply = JSON.parse(line)
        } catch {
          onReply({ type: '__malformed' })
          continue
        }
        onReply(reply)
      }
    })
    conn.on('end', resolve)
    conn.on('error', reject)
  })
}

async function main() {
  const request = parseArgs(process.argv.slice(2))
  if (!request) {
    console.error(USAGE)
    process.exit(2)
  }
  const envFile = fs.existsSync('.env.server') ? fs.readFileSync('.env.server', 'utf8') : null
  const socketPath = resolveSocketPath(process.env, envFile, os.homedir())
  if (!socketPath) {
    console.error("Cannot find the site's control socket. Set SITE_CONTROL_SOCKET or SITE_ROOT to what the site runs with.")
    process.exit(2)
  }

  let failed = false
  try {
    await send(socketPath, request, reply => {
      const { out, err, failed: replyFailed } = formatReply(reply)
      if (out) console.log(out)
      if (err) console.error(err)
      if (replyFailed) failed = true
    })
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ECONNREFUSED')) {
      console.error(`The site is not running (no control socket at ${socketPath}). Start it, then try again.`)
    } else {
      console.error(err instanceof Error ? err.message : String(err))
    }
    process.exit(1)
  }
  process.exit(failed ? 1 : 0)
}

// argv[1] is whatever path the process was launched with — the npm `bin`
// symlink (node_modules/.bin/agenthix-site), not this file's own location —
// while import.meta.url is always this file's resolved real path. Comparing
// real paths on both sides is what makes the installed, symlinked command
// run main() too.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main()
