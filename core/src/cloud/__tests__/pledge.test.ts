import { describe, expect, it } from 'vitest'
import { cloudPledgeSignerPage, cloudPledgeSignUrl, parseCloudBaseUrl, parseCloudPledgeStatus, parseCloudPledgeStatusRequest } from '../index.js'

const base = parseCloudBaseUrl('https://cloud.example.com')!

describe("whether a linked person signed the pledge, as hq reads it @SC-1125", () => {
  it('takes each answer Cloud gives', () => {
    expect(parseCloudPledgeStatus({ current_version: 2, signature: null, withdrawn: false })).toEqual({ current_version: 2, signature: null, withdrawn: false })
    expect(parseCloudPledgeStatus({ current_version: 2, signature: null, withdrawn: true })?.withdrawn).toBe(true)
    expect(parseCloudPledgeStatus({ current_version: 2, signature: { version: 1, signer_id: 's_8Q2v' }, withdrawn: false })?.signature).toEqual({ version: 1, signer_id: 's_8Q2v' })
  })

  it('refuses an answer that is not the shape, or that contradicts itself', () => {
    for (const bad of [
      null, 'nope', { current_version: 0, signature: null, withdrawn: false },
      { current_version: 2, signature: { version: 3, signer_id: 's' }, withdrawn: false },
      { current_version: 2, signature: { version: 1, signer_id: '../x' }, withdrawn: false },
      { current_version: 2, signature: { version: 1, signer_id: 's' }, withdrawn: true },
      { current_version: 2, signature: null },
    ]) expect(parseCloudPledgeStatus(bad)).toBeNull()
  })

  it("reads Cloud's side of the request, and builds the pages on Cloud", () => {
    expect(parseCloudPledgeStatusRequest({ subject: 'acct_42' })).toEqual({ subject: 'acct_42' })
    expect(parseCloudPledgeStatusRequest({ subject: 'two words' })).toBeNull()
    expect(cloudPledgeSignUrl(base)).toBe('https://cloud.example.com/pledge/sign')
    expect(cloudPledgeSignerPage(base, 's_8Q2v')).toBe('https://cloud.example.com/pledge/s/s_8Q2v')
  })
})
