import { describe, it, expect } from 'vitest'
import { impactLines, sinceWords, usedByWords, keyWords } from '../providerWords'
import type { ProviderImpact } from '../../impact'

const impact = (over: Partial<ProviderImpact> = {}): ProviderImpact => ({
  provider: { id: 'p1', name: 'Anthropic' }, defaults: [], agents: [], goesDown: [], ...over,
})

describe('providerWords @SC-1174 @SC-1178', () => {
  it('says what each default falls to, and to nothing when no other provider works', () => {
    const lines = impactLines(impact({
      defaults: [{ slot: 'worker', to: { id: 'c', name: 'Agenthix Cloud' } }, { slot: 'stt', to: null }],
      goesDown: ['stt'],
    }))
    expect(lines[0]).toBe('The default worker model falls to Agenthix Cloud, the next allowed, until you choose.')
    expect(lines[1]).toContain('The default speech to text falls to nothing')
    expect(lines[2]).toContain('Nothing else provides speech to text')
  })

  it('names the agents that fall to the defaults', () => {
    expect(impactLines(impact({ agents: [{ id: 'a', name: 'Kernel' }] }))[0]).toContain('Kernel uses its own choice')
    expect(impactLines(impact({ agents: [{ id: 'a', name: 'Kernel' }, { id: 'b', name: 'Ada' }] }))[0]).toContain('Kernel, Ada use their own choices')
  })

  it('writes what uses a provider, and nothing when nothing does', () => {
    expect(usedByWords({ defaults: ['conversation', 'stt'], agents: [{ id: 'a', name: 'Kernel' }] })).toBe('Used by the default conversation model, the default speech to text, the agent Kernel')
    expect(usedByWords({ defaults: [], agents: [] })).toBe('')
  })

  it('writes since as just now or a day and month', () => {
    const now = new Date('2026-10-23T12:00:00Z')
    expect(sinceWords('2026-10-23T11:59:30Z', now)).toBe('just now')
    expect(sinceWords('2026-10-12T09:00:00Z', now)).toBe('12 Oct')
  })

  it('shows only the last four characters, and nothing for Cloud', () => {
    expect(keyWords({ keyHint: 'a3f9', credential: 'api_key' })).toBe('key ending …a3f9')
    expect(keyWords({ keyHint: null, credential: 'none' })).toBeNull()
  })
})
