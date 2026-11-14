/**
 * Saving the web search key: checked with Exa first. Accepted is saved; refused is a final answer, not saved; no answer
 * is a failure that says so, not saved; saved anyway skips the check. The key is never in an answer. Exa is a fake.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpError } from 'wasp/server'

const h = vi.hoisted(() => ({ stored: [] as string[] }))
vi.mock('../../server/providerService', () => ({
  setWebSearchKey: async (v: string) => { h.stored.push(v) },
  deleteWebSearchKey: async () => undefined,
}))
vi.mock('../../server/identity/requireRole', () => ({ requireRole: async () => undefined }))
vi.mock('../../server/crypto/requireSecretsKey', () => ({ requireSecretsKey: () => undefined }))

import { KEY_NOT_CHECKED, KEY_REFUSED, setWebSearchKey } from '../webSearchKeyActions'
import { useWebSearchKeyCheck, type WebSearchKeyVerdict } from '../webSearchKeyCheck'

const KEY = 'exa-0123456789abcdef0123'
const context = { user: { id: 'u1' } } as unknown as Parameters<typeof setWebSearchKey>[1]
const asked: string[] = []
const exa = (verdict: WebSearchKeyVerdict) => useWebSearchKeyCheck({ check: async key => { asked.push(key); return verdict } })

async function refusal(args: { secret: string; unchecked?: boolean }): Promise<HttpError> {
  try {
    await setWebSearchKey(args, context)
  } catch (err) {
    if (err instanceof HttpError) return err
    throw err
  }
  throw new Error('setWebSearchKey did not refuse')
}

beforeEach(() => { h.stored = []; asked.length = 0 })
afterEach(() => useWebSearchKeyCheck(null))

describe('saving the web search key @SC-2142', () => {
  it('accepted by Exa: saved', async () => {
    exa({ ok: true })
    expect(await setWebSearchKey({ secret: ` ${KEY} ` }, context)).toEqual({ ok: true })
    expect(asked).toEqual([KEY])
    expect(h.stored).toEqual([KEY])
  })

  it('refused by Exa: a final answer in words for under the field, with Exa’s message, and not saved', async () => {
    exa({ ok: false, outcome: 'refused', detail: 'Invalid API key …' })
    const err = await refusal({ secret: KEY })
    expect(err.statusCode).toBe(422)
    expect(err.message).toBe(`${KEY_REFUSED} Exa says: Invalid API key …`)
    expect(err.data).toEqual({ code: 'refused_by_vendor' })
    expect(err.message).not.toContain(KEY)
    expect(h.stored).toEqual([])
  })

  it('Exa did not answer: a failure that says the key could not be checked, and not saved', async () => {
    exa({ ok: false, outcome: 'unchecked', detail: null })
    const err = await refusal({ secret: KEY })
    expect(err.statusCode).toBe(502)
    expect(err.message).toBe(KEY_NOT_CHECKED)
    expect(err.data).toEqual({ code: 'not_checked' })
    expect(h.stored).toEqual([])
  })

  it('saved anyway: Exa is not asked and the key is saved', async () => {
    exa({ ok: false, outcome: 'unchecked', detail: null })
    expect(await setWebSearchKey({ secret: KEY, unchecked: true }, context)).toEqual({ ok: true })
    expect(asked).toEqual([])
    expect(h.stored).toEqual([KEY])
  })

  it('an empty key is refused before Exa is asked', async () => {
    exa({ ok: true })
    expect((await refusal({ secret: '  ' })).statusCode).toBe(400)
    expect(asked).toEqual([])
  })
})
