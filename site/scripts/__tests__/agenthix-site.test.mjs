import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, resolveSiteRoot, resolveSocketPath, formatStatus, formatReply } from '../agenthix-site.mjs'

const scriptPath = fileURLToPath(new URL('../agenthix-site.mjs', import.meta.url))

describe('agenthix-site arguments', () => {
  it('parses the two commands', () => {
    expect(parseArgs(['status'])).toEqual({ command: 'status' })
    expect(parseArgs(['unregister'])).toEqual({ command: 'unregister' })
  })

  it('has no register command: a site is added in the Fleet Console, and anything else is refused', () => {
    expect(parseArgs(['register', 'https://hq.example.com'])).toBeNull()
    expect(parseArgs(['register'])).toBeNull()
    expect(parseArgs(['wipe'])).toBeNull()
    expect(parseArgs([])).toBeNull()
  })
})

describe('finding the site', () => {
  it('uses SITE_ROOT and expands ~', () => {
    expect(resolveSiteRoot({ SITE_ROOT: '~/.agenthix' }, null, '/home/me')).toBe('/home/me/.agenthix')
    expect(resolveSiteRoot({ SITE_ROOT: '/srv/site' }, null, '/home/me')).toBe('/srv/site')
  })

  it('falls back to SITE_ROOT in .env.server', () => {
    expect(resolveSiteRoot({}, 'PORT=4201\nSITE_ROOT=/data/site\n', '/home/me')).toBe('/data/site')
  })

  it('gives up when neither says', () => {
    expect(resolveSiteRoot({}, 'PORT=4201\n', '/home/me')).toBeNull()
  })
})

describe('finding the socket', () => {
  it('prefers SITE_CONTROL_SOCKET', () => {
    expect(resolveSocketPath({ SITE_CONTROL_SOCKET: '/run/agenthix-site/control.sock' }, null, '/home/me'))
      .toBe('/run/agenthix-site/control.sock')
  })
  it('falls back to the site root', () => {
    expect(resolveSocketPath({ SITE_ROOT: '~/.agenthix' }, null, '/home/me')).toBe('/home/me/.agenthix/run/control.sock')
  })
  it('is null when neither is known', () => {
    expect(resolveSocketPath({}, null, '/home/me')).toBeNull()
  })
})

describe('status output', () => {
  it('says plainly when the site is not connected to an HQ, and who adds it', () => {
    expect(formatStatus({ siteId: 's', hq: null })).toMatch(/Not connected to an HQ\. A fleet admin adds this site in the Fleet Console/)
  })

  it('says why it is not connected in a sentence with what to do, never the link\'s status word', () => {
    const text = formatStatus({ siteId: 's', problem: 'unreachable', hq: { url: 'https://hq', status: 'DEGRADED', connected: false, connectedAt: null, lastError: 'ECONNREFUSED', requiredProtocolVersion: null } })
    expect(text).toMatch(/https:\/\/hq/)
    expect(text).toMatch(/Status:     Not connected\. HQ does not answer/)
    expect(text).toMatch(/ECONNREFUSED/)
    expect(text).not.toMatch(/DEGRADED/)
  })

  it('says a site HQ removed or replaced must be added again in the Fleet Console, not that it is degraded', () => {
    const text = formatStatus({ siteId: 's', problem: 'credentialRefused', hq: { url: 'https://hq', status: 'REVOKED', connected: false, connectedAt: null, lastError: 'hq refused the connection (HTTP 401)', requiredProtocolVersion: null } })
    expect(text).toMatch(/removed or replaced in HQ\. A fleet admin adds this site again in the Fleet Console/)
    expect(text).not.toMatch(/REVOKED|DEGRADED/)
  })

  it('has a sentence for every cause the site reports', () => {
    for (const problem of ['secretTooShort', 'addressRefused', 'credentialStore', 'credentialRefused', 'versionMismatch', 'unreachable']) {
      const text = formatStatus({ siteId: 's', problem, hq: { url: 'https://hq', status: 'DEGRADED', connected: false, connectedAt: null, lastError: null, requiredProtocolVersion: null } })
      expect(text).toMatch(/Status:     Not connected\. [A-Z].*\.|Status:     Not connected\. .*<hq-url>/)
      expect(text).not.toContain(problem)
    }
  })

  it('says why hq\'s own site did not pair, rather than telling it to register', () => {
    const text = formatStatus({ siteId: 's', pairedBySecret: true, problem: 'secretTooShort', hq: null })
    expect(text).toMatch(/Not connected\. Its pairing secret/)
    expect(text).not.toMatch(/register/)
  })

  it('says plainly that a connected site is connected — a later cross-app test parses this exact line', () => {
    const text = formatStatus({ siteId: 's', hq: { url: 'https://hq', status: 'ACTIVE', connected: true, connectedAt: null, lastError: null, requiredProtocolVersion: null } })
    expect(text).toMatch(/Status:     Connected/)
  })
})

describe('formatting a reply from the site', () => {
  it('no longer knows the replies of registering', () => {
    for (const type of ['code', 'registered', 'notice']) {
      const { err, failed } = formatReply({ type })
      expect(err).toMatch(/unreadable/)
      expect(failed).toBe(true)
    }
  })

  it('says what hq did when the site left, in each case', () => {
    expect(formatReply({ type: 'unregistered', toldHq: true, hq: 'left' }).out).toBe('Unregistered. hq has taken this site out.')
    expect(formatReply({ type: 'unregistered', toldHq: false, hq: 'alreadyRemoved' }).out).toMatch(/had already taken this site out/)
    expect(formatReply({ type: 'unregistered', toldHq: false, hq: 'unreachable' }).out).toMatch(/could not be reached.*until it is removed in HQ/)
    expect(formatReply({ type: 'unregistered', toldHq: false, hq: 'failed' }).out).toMatch(/did not accept/)
    for (const hq of ['left', 'alreadyRemoved', 'unreachable', 'failed', 'notAsked']) {
      expect(formatReply({ type: 'unregistered', toldHq: hq === 'left', hq }).out).not.toMatch(/admin can revoke/)
    }
  })

  it('reports an error reply as failed', () => {
    const { err, failed } = formatReply({ type: 'error', message: 'boom' })
    expect(err).toBe('boom')
    expect(failed).toBe(true)
  })

  it('treats a reply it cannot recognise as a failure without throwing', () => {
    const { err, failed } = formatReply({ type: '__malformed' })
    expect(err).toBe('The site sent an unreadable reply.')
    expect(failed).toBe(true)
  })
})

describe('running as the installed command', () => {
  it('runs main() when invoked through a symlink, the way npm\'s bin does', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-'))
    const link = path.join(dir, 'agenthix-site')
    fs.symlinkSync(scriptPath, link)
    const result = spawnSync(process.execPath, [link], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/Usage:/)
  })

  it('runs main() the same way when invoked by its real path directly', () => {
    const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/Usage:/)
  })
})
