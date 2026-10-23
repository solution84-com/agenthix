import { describe, expect, it } from 'vitest'
import { parseCommand } from '../commands'
import { helpText } from '../messages'
import { providerCommand, type ProviderIo } from '../provider'

const KEY = 'sk-test-fake-0000000000a3f9'

function io(typed: string | null, yes = true) {
  const out: string[] = []
  const err: string[] = []
  const prompts: string[] = []
  const value: ProviderIo = {
    out: t => out.push(t), err: t => err.push(t), write: t => out.push(t),
    secret: async p => { prompts.push(p); return typed },
    confirm: async () => yes,
  }
  return { value, out, err, prompts }
}

describe('provider, read @SC-1233', () => {
  it('reads add, list and remove', () => {
    expect(parseCommand(['provider', 'add', 'anthropic'])).toEqual({ kind: 'providerAdd', vendor: 'anthropic' })
    expect(parseCommand(['provider', 'add', 'openai_compatible', '--address', 'http://lab.example.test/v1', '--name', 'Lab']))
      .toEqual({ kind: 'providerAdd', vendor: 'openai_compatible', address: 'http://lab.example.test/v1', name: 'Lab' })
    expect(parseCommand(['provider', 'list'])).toEqual({ kind: 'providerList' })
    expect(parseCommand(['provider', 'remove', 'openai', '--yes'])).toEqual({ kind: 'providerRemove', which: 'openai', yes: true })
  })

  it('refuses a key on the command line, Agenthix Cloud, and an address where it does not belong', () => {
    expect(parseCommand(['provider', 'add', 'anthropic', KEY])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['provider', 'add', 'cloud'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['provider', 'add', 'openai', '--address', 'https://x.test'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['provider', 'add', 'openai_compatible'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['provider', 'remove'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['provider'])).toMatchObject({ kind: 'usage' })
  })

  it('is in help', () => {
    expect(helpText('0.1.0')).toContain('provider add <vendor>')
  })
})

describe('provider, run @SC-1233', () => {
  it('asks for the key unseen, and sends it in the request only', async () => {
    const sent: unknown[] = []
    const t = io(`  ${KEY}  `)
    const code = await providerCommand({ kind: 'providerAdd', vendor: 'anthropic' }, async r => {
      sent.push(r)
      return { text: 'Added Anthropic (key ending …a3f9). Every organisation admin has been told.' }
    }, t.value)
    expect(code).toBe(0)
    expect(t.prompts).toEqual(['API key (not shown): '])
    expect(sent).toEqual([{ op: 'hq.provider', action: 'add', vendor: 'anthropic', key: KEY, name: undefined, address: undefined }])
    expect(t.out.join('\n')).not.toContain(KEY)
    expect(t.out.join('\n')).toContain('key ending …a3f9')
  })

  it('with nothing to read the key from, or no key, sends nothing', async () => {
    const sent: unknown[] = []
    const call = async (r: unknown) => { sent.push(r); return { text: '' } }
    expect(await providerCommand({ kind: 'providerAdd', vendor: 'anthropic' }, call, io(null).value)).toBe(1)
    expect(await providerCommand({ kind: 'providerAdd', vendor: 'anthropic' }, call, io('').value)).toBe(1)
    expect(sent).toEqual([])
    expect(await providerCommand({ kind: 'providerAdd', vendor: 'openai_compatible', address: 'http://lab.example.test/v1' }, call, io('').value)).toBe(0)
    expect(sent).toEqual([{ op: 'hq.provider', action: 'add', vendor: 'openai_compatible', key: '', name: undefined, address: 'http://lab.example.test/v1' }])
  })

  it('asks before removing', async () => {
    const sent: unknown[] = []
    const call = async (r: unknown) => { sent.push(r); return { text: 'Removed OpenAI.' } }
    expect(await providerCommand({ kind: 'providerRemove', which: 'openai', yes: false }, call, io(null, false).value)).toBe(1)
    expect(sent).toEqual([])
    expect(await providerCommand({ kind: 'providerRemove', which: 'openai', yes: true }, call, io(null).value)).toBe(0)
    expect(sent).toEqual([{ op: 'hq.provider', action: 'remove', which: 'openai' }])
  })
})
