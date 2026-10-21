import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { Firewall } from '../../protections/firewall'
import { AgentProtections, useProtections } from '../../protections/protections'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'

const ADDRESS = 'https://hq.acme.example'

let m: FakeMachine
let out: string
let err: string
let answers: string[]
let asked: string[]
const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async prompt => { asked.push(prompt); return answers.length ? answers.shift()! : null },
}
const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => m.ctx.now())
const flat = (s: string) => s.replace(/\s+/g, ' ')
const helperStarted = () => m.containers.byName('agenthix-host-uninstall') !== null

beforeEach(() => {
  m = fakeMachine()
  // No firewall table on this machine: nothing for the protections step to remove.
  useProtections(new AgentProtections(new Firewall(async () => ({ code: 1, stdout: '', stderr: 'Error: No such file or directory' })), async () => ({ problem: 'none' })))
  m.volumes.push('agenthix-host-figures')
  m.agentContainers.push('agenthix-agent-1')
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  out = ''
  err = ''
  answers = []
  asked = []
})
afterEach(() => m.cleanup())

describe('agenthix uninstall', () => {
  it('is a command, listed in help', async () => {
    expect(parseCommand(['uninstall', '--yes'])).toEqual({ kind: 'uninstall', yes: true })
    expect(parseCommand(['uninstall', 'now'])).toMatchObject({ kind: 'usage' })
    await cli('help')
    expect(flat(out)).toContain('uninstall Take Agenthix off this machine')
    out = ''
    await cli('help', 'uninstall')
    expect(flat(out)).toContain('Refused while HQ or a site is on this machine, running or suspended: erase it first')
  })

  it('lists exactly what goes and what it never touches, and asks; no removes nothing @SC-1161', async () => {
    answers = ['n']
    expect(await cli('uninstall')).toBe(1)
    expect(flat(out)).toContain('This takes Agenthix off hq-box, leaving nothing of it behind. It removes:')
    expect(out).toContain('  - 1 agent container\n')
    expect(out).toContain('  - the volume agenthix-host-figures\n')
    expect(flat(out)).toContain("- what is in the state folder, /home/sam/.agenthix")
    expect(flat(out)).toContain("- the host service's container agenthix-host, last")
    expect(flat(out)).toContain('Nothing outside the state folder is touched.')
    expect(asked).toEqual(['Uninstall Agenthix from hq-box? [y/N] '])
    expect(out).toContain('Nothing was changed.')
    expect(m.agentContainers).toEqual(['agenthix-agent-1'])
    expect(helperStarted()).toBe(false)
  })

  it('removes each step in turn once agreed, and says the host service’s container goes last, and its image stays @SC-1161', async () => {
    expect(await cli('uninstall', '--yes')).toBe(0)
    expect(out).toMatch(/Removing the containers left in its groups \.+ done \(1\)/)
    expect(out).toMatch(/Removing the agent protections \.+ nothing left/)
    expect(flat(out)).toContain("Uninstalled. In a few seconds agenthix-host-uninstall removes the host service's own container and its volume, and empties the state folder, then itself. It cannot reach anything beside that folder, so remove the empty folder yourself: rmdir /home/sam/.agenthix")
    expect(flat(out)).toContain("The host service's image stays, since its last step runs from it. To remove it afterwards: docker image rm aaaaaaaaaaaa")
    expect(helperStarted()).toBe(true)
  })

  it('ends by listing what it did not remove @SC-1161', async () => {
    m.volumes.push('agenthix-console-state')
    m.dockerFails.add('volume rm')
    expect(await cli('uninstall', '--yes')).toBe(1)
    expect(out).toMatch(/Removing the volumes \.+ failed/)
    expect(out).toMatch(/Removing the networks \.+ nothing left/)
    expect(flat(out)).toContain('Uninstalled, but not all of it.')
    expect(flat(out)).toContain('Not removed: - The volume agenthix-console-state: Error response from daemon: the disk is full.')
    expect(flat(out)).toContain('Running agenthix uninstall again removes what is left')
    expect(helperStarted()).toBe(true)
  })

  it('is refused while HQ is here, before asking anything @SC-1159', async () => {
    await install(m.ctx, ADDRESS, () => {})
    expect(await cli('uninstall', '--yes')).toBe(1)
    expect(flat(err)).toContain(`Not uninstalled: HQ at ${ADDRESS} is on hq-box. Nothing was removed.`)
    expect(asked).toEqual([])
  })

  describe('after an erase @SC-1160', () => {
    beforeEach(async () => {
      await install(m.ctx, ADDRESS, () => {})
      answers = [ADDRESS]
      expect(await cli('hq', 'erase')).toBe(0)
      out = ''
      asked = []
    })

    it('says what the bin keeps and until when, and purges it only once HQ’s address is typed — --yes does not answer it', async () => {
      answers = ['hq.acme.example']
      expect(await cli('uninstall', '--yes')).toBe(1)
      expect(flat(out)).toContain('HQ at https://hq.acme.example was erased on')
      expect(flat(out)).toContain('Uninstalling purges it now, and it cannot be brought back. To keep it instead, press Enter, and until then agenthix hq restore brings it back.')
      expect(asked).toEqual(["To purge it now, type HQ's address: "])
      expect(flat(err)).toBe("Not uninstalled: that is not HQ's address. Nothing was removed. ")
      expect(helperStarted()).toBe(false)

      answers = [ADDRESS]
      expect(await cli('uninstall')).toBe(0)
      expect(out).toMatch(/Purging the erased backups \.+ done/)
      expect(helperStarted()).toBe(true)
    })
  })
})
