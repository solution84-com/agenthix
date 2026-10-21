/** A run that stopped for lack of resources, in the words hq shows (host-management spec §10). */
import { describe, it, expect, vi } from 'vitest'
import type { TranscriptRow } from '@agenthix/core'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { shortRunSentence, withSiteName } from '../runResourceWords'
import { runShortWords } from '../runResourceNotice'

const GIB = 1024 ** 3

const row = (over: Partial<TranscriptRow>): TranscriptRow =>
  ({ id: 'e1', sessionId: 's1', role: 'SYSTEM', content: '', createdAt: new Date(0).toISOString(), ...over }) as TranscriptRow

describe('the sentence on the run and the task', () => {
  it('names the site, the limit it hit and who was told', () => {
    expect(shortRunSentence({ cause: 'memory', limit: 4 * GIB }, 'office-server')).toBe(
      'This run stopped: it ran out of memory (each run on office-server gets 4 GB). Your fleet admins have been told.')
    expect(shortRunSentence({ cause: 'disk', limit: null }, 'office-server')).toBe(
      'This run stopped: the disk on office-server is full. Your fleet admins have been told.')
    expect(shortRunSentence({ cause: 'processes', limit: 4096 }, 'office-server')).toMatch(/^This run stopped: .*4096.*Your fleet admins have been told\.$/)
  })

  it('is nothing for a cause hq does not know, never the raw code', () => {
    expect(shortRunSentence({ cause: 'OOMKilled' }, 'office-server')).toBeNull()
    expect(shortRunSentence(undefined, 'office-server')).toBeNull()
  })
})

describe("a conversation's failed row", () => {
  it('is written again with the site\'s name; every other row is left as it came', () => {
    const failed = row({ kind: 'RUN_FAILED', content: 'x', detail: { reason: 'x', resource: { cause: 'memory', limit: 4 * GIB } } })
    const plain = row({ kind: 'RUN_FAILED', content: 'The model provider was overloaded.', detail: { reason: 'The model provider was overloaded.' } })
    const message = row({ role: 'ASSISTANT', content: 'hello' })
    const [a, b, c] = withSiteName([failed, plain, message], 'office-server')
    const sentence = 'This run stopped: it ran out of memory (each run on office-server gets 4 GB). Your fleet admins have been told.'
    expect(a.content).toBe(sentence)
    expect(a.detail).toEqual({ reason: sentence, resource: { cause: 'memory', limit: 4 * GIB } })
    expect(b).toBe(plain)
    expect(c).toBe(message)
  })
})

describe('what the people who look after machines are told', () => {
  it('says what happened and what to do', () => {
    expect(runShortWords({ cause: 'memory', limit: 4 * GIB }, 'office-server')).toEqual({
      title: 'A run on office-server ran out of memory',
      body: 'Each run there gets 4 GB. Give each run more memory, or run fewer at once, with "agenthix capacity set --memory <size>" or "agenthix capacity set --containers <n>" on that machine.',
    })
    expect(runShortWords({ cause: 'processes', limit: 4096 }, 'office-server').body).toContain('agenthix capacity set --processes <n>')
    expect(runShortWords({ cause: 'disk', limit: null }, 'office-server').title).toBe('A run on office-server stopped: its disk is full')
  })
})
