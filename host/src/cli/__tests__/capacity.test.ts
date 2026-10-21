import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { ownerHandler } from '../../owner/dispatch'
import { capacityText, parseCapacity } from '../capacity'
import { parseCommand } from '../commands'
import { helpText } from '../messages'
import { runCommand, type Io, type Send } from '../run'

const GIB = 1024 ** 3
let m: FakeMachine
let out: string
let err: string
const io: Io = { out: t => { out += `${t}\n` }, write: t => { out += t }, err: t => { err += `${t}\n` }, ask: async () => null }
beforeEach(() => { m = fakeMachine(); out = ''; err = '' })
afterEach(() => m.cleanup())
const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0')
const flat = (s: string) => s.replace(/\s+/g, ' ')

describe('agenthix capacity @SC-826', () => {
  it('shows the machine’s ceilings, what the machine has, and how to change them', () => {
    const text = capacityText('office-server', { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 4 }, { memoryBytes: 16 * GIB, processors: 8 })
    expect(text).toBe([
      'What each agent run on office-server may use (this machine has 16 GB',
      'of memory and 8 processors):',
      '  Memory per agent container        4 GB',
      '  Processors per agent container    2',
      '  Processes per agent container     512',
      '  Agent containers at once          4',
      'HQ and projects may narrow these for a run; a run gets the smaller.',
      'To change them: agenthix capacity set --memory 6GB --containers 2',
    ].join('\n'))
  })

  it('reads them from the host service', async () => {
    expect(await cli('capacity')).toBe(0)
    expect(out).toContain('What each agent run on hq-box may use')
    expect(out).toContain('Memory per agent container        8 GB')
  })

  it('sets only what it is given, keeping the rest, and says what new runs get', async () => {
    expect(await cli('capacity', 'set', '--memory', '256MB', '--containers', '1')).toBe(0)
    expect(flat(out)).toBe('Changed. New runs get 256 MB and at most 1 container at once. Runs already going keep what they started with. HQ will show the new limits on Where work runs. ')
    expect(m.ctx.state.readJson('machine.json')).toMatchObject({
      ceilings: { memoryBytesPerContainer: 256 * 1024 ** 2, cpusPerContainer: 2, processesPerContainer: 4096, containersAtOnce: 1 },
    })
  })

  it('says why it changed nothing when they do not fit the machine', async () => {
    expect(await cli('capacity', 'set', '--memory', '1024GB', '--containers', '64')).toBe(1)
    expect(flat(err)).toMatch(/^Not changed: 64 containers at 1024 GB could use 65536 GB; this machine has/)
  })

  it('has no setting for the protections @SC-824', () => {
    expect(parseCapacity(['set', '--protections', 'off'])).toEqual({ kind: 'usage', message: 'No such setting. Shutting agents out of this machine is always on.' })
  })

  it('refuses what is not a setting or not a value', () => {
    expect(parseCapacity(['set', '--disk', '5GB'])).toMatchObject({ kind: 'usage', message: expect.stringContaining('No such setting: --disk') })
    expect(parseCapacity(['set', '--memory', 'lots'])).toMatchObject({ kind: 'usage' })
    expect(parseCapacity(['set', '--containers', '2.5'])).toMatchObject({ kind: 'usage' })
    expect(parseCapacity(['set'])).toMatchObject({ kind: 'usage' })
    expect(parseCapacity(['set', '--processors', '1.5', '--processes', '512'])).toEqual({ kind: 'capacitySet', change: { cpusPerContainer: 1.5, processesPerContainer: 512 } })
  })

  it('is in help, among the machine’s own commands', () => {
    expect(helpText('0.2.0')).toMatch(/status[^\n]*\n\s+capacity \[set …\]\s+Show or set what each agent may use/)
    expect(flat(helpText('0.2.0', 'capacity'))).toContain('they are always on.')
  })
})
