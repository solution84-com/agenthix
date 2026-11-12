import { describe, expect, it } from 'vitest'
import type { MachineStatus } from '../../status/machineStatus'
import { statusText, type StatusWithBackups } from '../statusText'
import { SITE_CAUSES } from '../../status/siteControl'

const machine = { name: 'hq-box', hostServiceVersion: '0.2.0' }
const hq = (over: Partial<NonNullable<MachineStatus['hq']>> = {}): NonNullable<MachineStatus['hq']> => ({
  address: 'https://hq.acme.example', version: '0.2.0', listen: { bind: '127.0.0.1', port: 4100 },
  containers: 'running', answer: { users: 3, runningAgents: null }, ...over,
})
const site = (over: Partial<NonNullable<MachineStatus['site']>> = {}): NonNullable<MachineStatus['site']> => ({
  name: 'hq-box', version: '0.2.0', carriesHq: true, containers: 'running', connection: 'connected', cause: null, ...over,
})
const raw = (s: Partial<MachineStatus>) => statusText({ machine, hq: null, site: null, ...s })
/** The words with the wrapping taken out, so a check does not depend on where a line breaks. */
const text = (s: Partial<MachineStatus>) => raw(s).replace(/\s+/g, ' ')

/** Words that belong to the code, never to what a person reads. */
const INTERNAL = /notConnected|unpaired|DEGRADED|ONLINE|VERSION_MISMATCH|\bnull\b|undefined|compose|container_name|HQ_URL|\b401\b/

describe('agenthix status @SC-822', () => {
  it('says nothing of nightly backups on a demo, which takes none @SC-1993', () => {
    const backups = { time: { hour: 2, minute: 0 }, carriesHq: true, last: null, copy: null, location: null, lastExportAt: null }
    const out = statusText({ machine, hq: hq(), site: site(), demo: { nextResetAt: '2026-11-11T18:00:00.000Z' }, backups } as StatusWithBackups)
    expect(out).toContain('no nightly backup')
    expect(out).not.toContain('No backup yet')
  })

  it('opens with the machine, how it is hosted and the host service’s version', () => {
    expect(raw({}).split('\n')[0]).toBe('hq-box · Self-hosted · host service 0.2.0')
  })

  it('says nothing runs yet on a machine with no install, and how to install', () => {
    const out = text({})
    expect(out).toContain('Nothing runs here yet.')
    expect(out).toContain('agenthix install')
  })

  it('gives hq its address and version, and its people in a sentence', () => {
    const out = text({ hq: hq(), site: site() })
    expect(out).toContain('HQ https://hq.acme.example 0.2.0')
    expect(out).toContain('Running. 3 people have accounts.')
    expect(text({ hq: hq({ answer: { users: 1, runningAgents: null } }), site: site() })).toContain('Running. 1 person has an account.')
  })

  it('points a fresh HQ at the link for the first account', () => {
    const out = text({ hq: hq({ answer: { users: 0, runningAgents: null } }), site: site() })
    expect(out).toContain('No one has an account yet.')
    expect(out).toContain('agenthix hq invite-admin')
  })

  it('says HQ is starting when its containers run but it does not answer yet', () => {
    const out = text({ hq: hq({ answer: null }), site: site({ connection: 'unknown' }) })
    expect(out).toContain('Starting.')
    expect(out).toContain('agenthix hq logs')
    expect(out).toContain('not known while HQ does not answer')
  })

  it('says a stopped HQ or site loses nothing, and how to start it', () => {
    const out = text({ hq: hq({ containers: 'stopped', answer: null }), site: site({ containers: 'stopped', connection: 'unknown' }) })
    expect(out).toContain('Stopped. Nothing is lost.')
    expect(out).toContain('Not running. Nothing is lost.')
    expect(out).toContain('agenthix install')
  })

  const textM = (s: Partial<StatusWithBackups>) => statusText({ machine, hq: null, site: null, ...s }).replace(/\s+/g, ' ')
  const managed = { managedBy: { fingerprint: 'AAAA', hqAddress: 'https://hq.acme.example', local: false, connected: true, since: '2026-10-14T09:00:00Z', moving: null }, consoleHere: null, retiredHere: null }

  it('does not send a machine a Fleet Console manages to install HQ when no site runs on it', () => {
    const out = textM({ management: managed })
    expect(out).toContain('No site runs here.')
    expect(out).toContain('a fleet admin adds a site here or tries the install again')
    expect(out).not.toContain('agenthix install')
    expect(out).not.toContain('Nothing runs here yet')
  })

  it('does not send a stopped site on a machine without HQ to install, which would put HQ there', () => {
    const connected = textM({ site: site({ carriesHq: false, containers: 'stopped', connection: 'unknown' }), management: managed })
    expect(connected).toContain('Not running. Nothing is lost. Ask a fleet admin to start it again in the Fleet Console')
    expect(connected).not.toContain('agenthix install')
    const left = textM({ site: site({ carriesHq: false, containers: 'stopped', connection: 'unknown' }), management: { ...managed, managedBy: null } })
    expect(left).toContain('A fleet admin gives this machine a code in the Fleet Console')
    expect(left).toContain('agenthix console connect <hq address> <code>')
    expect(left).not.toContain('agenthix install')
  })

  it('tells a site on another machine that it reaches HQ at its address, not over a private Docker network', () => {
    const out = textM({ site: site({ carriesHq: false, connection: 'notConnected', cause: 'unreachable' }) })
    expect(out).toContain("cannot reach HQ at HQ's address from this machine")
    expect(out).not.toContain('private Docker network')
    expect(textM({ site: site({ carriesHq: false, connection: 'notConnected', cause: 'credentialRefused' }) })).not.toContain('private Docker network')
  })

  it('says a site a restore onto another machine replaced is refused by HQ, keeps its data, and how to remove it', () => {
    const replaced = site({ carriesHq: false, connection: 'notConnected', cause: 'credentialRefused', replacedAt: '2026-10-15T09:33:00.000Z' })
    const out = textM({ site: replaced, management: { ...managed, managedBy: { ...managed.managedBy, connected: false } } })
    expect(out).toContain('Replaced. On 15 October 2026 this site was restored from its backup onto another machine, which runs it now.')
    expect(out).toContain('HQ refuses this copy, so it takes no runs')
    expect(out).toContain('Its data stays on this machine.')
    expect(out).toContain('agenthix site erase')
    expect(out).toContain('HQ no longer accepts this machine: it left the fleet when its site was restored onto another machine.')
    expect(out).toContain('agenthix console disconnect')
    expect(out).not.toContain('reconnects by itself')
    expect(out).not.toContain('A fleet admin removes the site')
    const lines = raw({ site: replaced })
    expect(lines).not.toMatch(INTERNAL)
    for (const line of lines.split('\n')) expect(line.length).toBeLessThanOrEqual(72)
  })

  it('badges the site that carries HQ, and says so when it is connected', () => {
    const out = text({ hq: hq(), site: site() })
    expect(out).toContain('Site hq-box 0.2.0 HQ · site')
    expect(out).toContain('Connected to HQ, which this site carries.')
  })

  it('gives each reason the site is not connected in words, with a next step', () => {
    const notConnected = text({ hq: hq(), site: site({ connection: 'notConnected' }) })
    expect(notConnected).toContain('Not connected.')
    expect(notConnected).toContain('private Docker network, so the address is not the cause')
    expect(notConnected).toContain('agenthix site logs')
    expect(text({ hq: hq(), site: site({ connection: 'unpaired' }) })).toContain('pairing secret')
    expect(text({ hq: hq(), site: site({ connection: 'upgrade' }) })).toContain('versions')
  })

  it('says how HQ is served from its address', () => {
    expect(text({ hq: hq(), site: site() })).toContain('point it at 127.0.0.1:4100')
    expect(text({ hq: hq({ address: 'http://localhost:4100' }), site: site() })).toContain('only on this machine')
  })

  it('never prints an internal word, in any state', () => {
    const states: Partial<MachineStatus>[] = [{}]
    for (const containers of ['running', 'starting', 'stopped', 'missing'] as const) {
      for (const connection of ['connected', 'notConnected', 'upgrade', 'unpaired', 'unknown'] as const) {
        states.push({ hq: hq({ containers }), site: site({ containers, connection }) })
        states.push({ hq: hq({ containers, answer: null }), site: site({ containers, connection }) })
      }
    }
    for (const s of states) expect(text(s)).not.toMatch(INTERNAL)
  })

  it('keeps every line within a terminal’s width', () => {
    const out = raw({ hq: hq({ answer: null }), site: site({ connection: 'notConnected' }) })
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(72)
  })
})

describe('agenthix status, why the site is not connected and the agents working @SC-822', () => {
  it('counts the agents working, as the board does', () => {
    expect(text({ hq: hq({ answer: { users: 3, runningAgents: 2 } }), site: site() })).toContain('Running. 3 people have accounts; 2 agents are working.')
    expect(text({ hq: hq({ answer: { users: 1, runningAgents: 1 } }), site: site() })).toContain('Running. 1 person has an account; 1 agent is working.')
  })

  it('names HQ\'s refusal of the site that carries it, and the command that sets the same secret again', () => {
    const out = text({ hq: hq(), site: site({ connection: 'notConnected', cause: 'credentialRefused' }) })
    expect(out).toContain('Not connected. HQ refused it: its pairing secret is not the one HQ expects.')
    expect(out).toContain('the address is not the cause')
    expect(out).toContain('agenthix install')
  })

  it('has a sentence and a next step for every cause, never an internal word, within the terminal width', () => {
    for (const cause of SITE_CAUSES) {
      const lines = raw({ hq: hq(), site: site({ connection: 'notConnected', cause }) })
      expect(lines).not.toMatch(INTERNAL)
      expect(lines).not.toContain(cause)
      expect(lines).toMatch(/agenthix (install|site logs)/)
      for (const line of lines.split('\n')) expect(line.length).toBeLessThanOrEqual(72)
    }
  })

  it('names the site\'s own cause while HQ does not answer, unless it is only that HQ does not answer', () => {
    expect(text({ hq: hq({ answer: null }), site: site({ connection: 'unknown', cause: 'secretTooShort' }) })).toContain('shorter than HQ accepts')
    expect(text({ hq: hq({ answer: null }), site: site({ connection: 'unknown', cause: 'unreachable' }) })).toContain('not known while HQ does not answer')
  })

  it('says a site on a machine without HQ is connected, or not, without the words for HQ\'s own site', () => {
    expect(text({ site: site({ carriesHq: false, connection: 'connected' }) })).toContain('Connected to HQ.')
    const out = text({ site: site({ carriesHq: false, connection: 'notConnected' }) })
    expect(out).toContain('Not connected to HQ. To see why:')
    expect(out).not.toContain('private Docker network')
  })

  it('keeps the old sentence when nothing says why', () => {
    expect(text({ hq: hq(), site: site({ connection: 'notConnected' }) })).toContain('HQ has not seen this site connect.')
  })
})

describe('agenthix status: the agent protections @SC-825', () => {
  const holding = { holding: true, rules: ['machine-ports', 'published-ports', 'metadata-address'] as const, checkedAt: '2026-10-14T09:00:00Z', problem: null }
  const notHolding = { holding: false, rules: [], checkedAt: '2026-10-14T09:00:00Z', problem: "The host service may not change this machine's firewall. Start its container with --cap-add NET_ADMIN, as the guide's command does." }

  it('states them as a fact, with no setting to offer, while they hold', () => {
    const out = raw({ hq: hq(), site: site(), protections: { ...holding, rules: [...holding.rules] } })
    const lines = out.split('\n')
    expect(lines.slice(-3)).toEqual([
      'Protections  always on',
      "  Agents can't reach this machine, its other containers, or the cloud",
      '  metadata address.',
    ])
    expect(out).not.toMatch(/protections (on|off)|capacity set/)
  })

  it('says why they do not hold, that no agent starts until they do, and where to look', () => {
    const out = text({ site: site(), protections: notHolding })
    expect(out).toContain('Protections not in place')
    expect(out).toContain('--cap-add NET_ADMIN')
    expect(out).toContain('the site here starts no agent')
    expect(out).toContain('docker logs agenthix-host')
    for (const line of raw({ site: site(), protections: notHolding }).split('\n')) expect(line.length).toBeLessThanOrEqual(72)
    expect(out).not.toMatch(INTERNAL)
  })

  it('are left out on a machine that runs no site', () => {
    expect(text({ hq: hq(), protections: notHolding })).not.toContain('Protections')
  })
})
