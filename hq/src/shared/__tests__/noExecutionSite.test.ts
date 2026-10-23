import { describe, it, expect } from 'vitest'
import {
  NO_EXECUTION_SITE_MESSAGE,
  NO_EXECUTION_SITE_NOTICE,
  hasNoExecutionSite,
  isNoExecutionSiteError,
} from '../noExecutionSite'

describe('the no-Execution-Site wording', () => {
  it('the error message is exactly the sentence the product owner fixed', () => {
    expect(NO_EXECUTION_SITE_MESSAGE).toBe('No Execution Site is connected. A fleet admin adds one in the Fleet Console; Manage organisation › Where work runs › Sites shows how sites are doing.')
  })

  it('the notice is the message\'s first sentence, so the two cannot disagree', () => {
    expect(NO_EXECUTION_SITE_MESSAGE.startsWith(`${NO_EXECUTION_SITE_NOTICE}.`)).toBe(true)
  })

  it('recognises the error by its message, and nothing else', () => {
    expect(isNoExecutionSiteError(new Error(NO_EXECUTION_SITE_MESSAGE))).toBe(true)
    expect(isNoExecutionSiteError(new Error('Something else'))).toBe(false)
    expect(isNoExecutionSiteError(NO_EXECUTION_SITE_MESSAGE)).toBe(false)
  })
})

describe('hasNoExecutionSite', () => {
  it('is false while the list has not loaded', () => {
    expect(hasNoExecutionSite(undefined)).toBe(false)
  })

  it('is true for an empty registry', () => {
    expect(hasNoExecutionSite([])).toBe(true)
  })

  it('is true when every site is revoked', () => {
    expect(hasNoExecutionSite([{ status: 'REVOKED' }, { status: 'REVOKED' }])).toBe(true)
  })

  it.each(['ONLINE', 'OFFLINE', 'REGISTERED', 'VERSION_MISMATCH'])('is false when a %s site exists', (status) => {
    expect(hasNoExecutionSite([{ status: 'REVOKED' }, { status }])).toBe(false)
  })
})
