/** The shared helpers that word a failed press say what happened, never a request's address or a status line. */
import { describe, expect, it } from 'vitest'
import { refusalText } from '../refusal'
import { messageOf } from '../../assets/components/messageOf'
import { messageOf as actMessageOf } from '../../assets/pages/place/useAct'
import { reasonOf } from '../../projects/place/people/peopleErrors'
import { refusalOf } from '../../workspaceView/livePreviewWords'
import { errorMessage } from '../../diagnostics/pages/diagnosticsWords'

const noAnswer = Object.assign(new Error('Request failed due to a network error: POST http://localhost/operations/x'), { name: 'NetworkError' })
const crash = Object.assign(new Error('Request failed with status code 500 Internal Server Error: POST http://hq/operations/x'), { statusCode: 500 })
const refused = Object.assign(new Error('Only an admin may do that.'), { statusCode: 403, data: { message: 'Only an admin may do that.' } })

const helpers: [string, (e: unknown) => string][] = [
  ['refusalText', e => refusalText(e)],
  ['messageOf', e => messageOf(e)],
  ['useAct messageOf', e => actMessageOf(e)],
  ['reasonOf', e => reasonOf(e, 'Nothing was changed.')],
  ['refusalOf', e => refusalOf(e, 'It did not start.')],
  ['errorMessage', e => errorMessage(e)],
]

describe.each(helpers)('%s @SC-2152', (_, words) => {
  it('no answer: "HQ did not answer."', () => expect(words(noAnswer)).toBe('HQ did not answer.'))
  it('a 5xx without words of HQ’s own: "Something went wrong in HQ."', () => expect(words(crash)).toBe('Something went wrong in HQ.'))
  it('a final answer: HQ’s words', () => expect(words(refused)).toBe('Only an admin may do that.'))
})
