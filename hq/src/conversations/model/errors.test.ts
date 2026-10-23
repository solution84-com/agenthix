import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import { ModelCallError } from '../contract'
import { toModelCallError } from './errors'

const live = new AbortController().signal
const apiError = (statusCode: number | undefined, message = 'failed', responseBody = '') =>
  new APICallError({ message, url: 'https://x', requestBodyValues: {}, statusCode, responseBody })

describe('toModelCallError @SC-956', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [402, 'quota'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'invalid'],
    [404, 'invalid'],
  ] as const)('maps status %i to %s', (status, kind) => {
    expect(toModelCallError(apiError(status), 'openai', live).kind).toBe(kind)
  })

  it('tells quota from a rate limit by what the provider says', () => {
    expect(toModelCallError(apiError(429, 'You exceeded your current quota'), 'openai', live).kind).toBe('quota')
    expect(toModelCallError(apiError(400, 'Your credit balance is too low'), 'anthropic', live).kind).toBe('quota')
  })

  it('treats an unreachable provider as unavailable', () => {
    expect(toModelCallError(apiError(undefined, 'Cannot connect'), 'google', live).kind).toBe('unavailable')
    expect(toModelCallError(new TypeError('fetch failed'), 'google', live).kind).toBe('unavailable')
  })

  it('is cancelled when the signal aborted, whatever the error', () => {
    const controller = new AbortController()
    controller.abort()
    expect(toModelCallError(new Error('whatever'), 'anthropic', controller.signal).kind).toBe('cancelled')
    expect(toModelCallError(Object.assign(new Error('x'), { name: 'AbortError' }), 'anthropic', live).kind).toBe('cancelled')
  })

  it('names the provider and where to fix a refused key', () => {
    const error = toModelCallError(apiError(401), 'anthropic', live)
    expect(error.reasonForPerson).toBe('The Anthropic key was refused — check it in Manage organisation › Providers.')
  })

  it('keeps the key and the provider body out of the reason', () => {
    const error = toModelCallError(apiError(500, 'sk-secret-123 leaked', '{"error":"sk-secret-123"}'), 'openai', live)
    expect(error.reasonForPerson).not.toContain('sk-secret-123')
    expect(error.message).not.toContain('sk-secret-123')
  })

  it('returns a ModelCallError unchanged and files anything else under other', () => {
    const own = new ModelCallError('invalid', 'x')
    expect(toModelCallError(own, 'openai', live)).toBe(own)
    expect(toModelCallError('strange', 'openai', live).kind).toBe('other')
  })
})
