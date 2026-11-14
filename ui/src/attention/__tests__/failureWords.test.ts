/** The words a failed press says: no answer, the server's own error, and a final answer in its own words. */
import { describe, it, expect } from 'vitest'
import { failureWords } from '../failureWords'

const named = (name: string, message: string) => Object.assign(new Error(message), { name })
const http = (statusCode: number, message: string, data?: unknown) => Object.assign(new Error(message), { statusCode, data })

describe('failureWords @SC-2153', () => {
  it('no answer, or a network error: "HQ did not answer.", never the request’s address', () => {
    expect(failureWords(named('NetworkError', 'Request failed due to a network error: POST http://localhost:4101/operations/x'), 'HQ')).toBe('HQ did not answer.')
    expect(failureWords(named('TimeoutError', 'Request timed out: POST http://localhost:4101/operations/x'), 'HQ')).toBe('HQ did not answer.')
    expect(failureWords(new TypeError('Failed to fetch'), 'HQ')).toBe('HQ did not answer.')
    expect(failureWords(http(502, 'Request failed with status code 502 Bad Gateway: POST http://hq/operations/x', 'Bad Gateway'), 'HQ')).toBe('HQ did not answer.')
  })

  it('HQ’s own error (5xx) with no words of its own: "Something went wrong in HQ."', () => {
    expect(failureWords(http(500, 'Request failed with status code 500 Internal Server Error: POST http://hq/operations/x', '<html>…'), 'HQ')).toBe('Something went wrong in HQ.')
    expect(failureWords(http(500, 'Internal Server Error'), 'HQ')).toBe('Something went wrong in HQ.')
  })

  it('a final answer: its own message', () => {
    expect(failureWords(http(422, 'That key was refused', { message: 'That key was refused' }), 'HQ')).toBe('That key was refused')
    expect(failureWords(http(400, 'A key is required'), 'HQ')).toBe('A key is required')
    expect(failureWords(http(403, 'Only an organisation admin may change providers.', { message: 'Only an organisation admin may change providers.', data: { code: 'not_allowed' } }), 'HQ'))
      .toBe('Only an organisation admin may change providers.')
  })

  it('a 5xx HQ wrote words for keeps them', () => {
    const words = 'The Execution Site running this workflow can\'t be reached; try again once it is back. Nothing was changed.'
    expect(failureWords(http(503, words, { message: words }), 'HQ')).toBe(words)
  })

  it('a refusal with only a status line says the fallback, and a failure made in the page keeps its words', () => {
    expect(failureWords(http(413, 'Request failed with status code 413 Payload Too Large: POST http://hq/x'), 'HQ', 'Could not save')).toBe('Could not save')
    expect(failureWords(new Error('Choose a file first'), 'HQ')).toBe('Choose a file first')
    expect(failureWords(undefined, 'HQ')).toBe('Something went wrong in HQ.')
    expect(failureWords(undefined, 'the Fleet Console', 'Could not save')).toBe('Could not save')
  })
})
