// @vitest-environment jsdom
/** A failure handed to the attention dialog is said in words for the server the app's root named; words pass as given. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FailureServer } from '../failureServer'
import { ShowAttention } from '../useAttentionWhen'

afterEach(cleanup)

const named = (name: string, message: string) => Object.assign(new Error(message), { name })
const http = (statusCode: number, message: string, data?: unknown) => Object.assign(new Error(message), { statusCode, data })

function said(text: unknown, server: string | null = 'HQ', kind: 'alert' | 'nudge' = 'alert') {
  const shown = <ShowAttention text={text} kind={kind} title="It was not saved" />
  render(server ? <FailureServer name={server}>{shown}</FailureServer> : shown)
  return kind === 'alert' ? screen.getByTestId('attention-text').textContent : screen.getByRole('status').textContent
}

describe('a failure handed to the attention dialog @SC-2153', () => {
  it('no answer: "HQ did not answer.", never the request’s address', () => {
    expect(said(named('NetworkError', 'Request failed due to a network error: POST http://localhost/operations/x'))).toBe('HQ did not answer.')
  })

  it('a 5xx with HQ’s own words keeps them; one without says "Something went wrong in HQ."', () => {
    const words = 'The Execution Site can’t be reached. Nothing was changed.'
    expect(said(http(503, words, { message: words }))).toBe(words)
    cleanup()
    expect(said(http(500, 'Request failed with status code 500 Internal Server Error: POST http://hq/operations/x'))).toBe('Something went wrong in HQ.')
  })

  it('a final answer: its own words', () => {
    expect(said(http(403, 'Only an admin may do that.', { message: 'Only an admin may do that.' }))).toBe('Only an admin may do that.')
  })

  it('names the server the root gave, as the start of a sentence', () => {
    expect(said(new TypeError('Failed to fetch'), 'the Fleet Console')).toBe('The Fleet Console did not answer.')
  })

  it('a thing with a message but no Error is said the same way', () => {
    expect(said({ statusCode: 500, message: 'Request failed with status code 500' })).toBe('Something went wrong in HQ.')
    cleanup()
    expect(said({ message: 'Choose a file first.' })).toBe('Choose a file first.')
  })

  it('a nudge says the same words', () => {
    expect(said(named('TimeoutError', 'Request timed out: GET http://hq/x'), 'HQ', 'nudge')).toContain('HQ did not answer.')
  })

  it('words passed as a string are shown as given, even ones that look like a status line', () => {
    expect(said('Request failed with status code 500')).toBe('Request failed with status code 500')
  })

  it('outside a FailureServer, a failure keeps its message', () => {
    expect(said(new Error('Nope.'), null)).toBe('Nope.')
  })
})
