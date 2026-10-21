import { describe, expect, it } from 'vitest'
import { CLOUD_PATHS, cloudLinkOut } from '../cloudLinks'

describe('links out to Agenthix Cloud @SC-1119', () => {
  it('carry a path on Cloud, the entry point, the task and the page to return to, and nothing else', () => {
    const url = new URL(cloudLinkOut('https://cloud.test', CLOUD_PATHS.sites, { from: 'hq-offer', task: 'offer-site', returnPath: '/projects' })!)
    expect(url.origin).toBe('https://cloud.test')
    expect(url.pathname).toBe(CLOUD_PATHS.sites)
    expect([...url.searchParams.keys()].sort()).toEqual(['from', 'return', 'task'])
    expect(url.searchParams.get('return')).toBe('/projects')
  })

  it('never carry an address of hq: a return that is not a path on hq is left out', () => {
    for (const bad of ['https://hq.acme.example/projects', '//hq.acme.example', 'projects', '/a?b=c', '/a#b']) {
      expect(new URL(cloudLinkOut('https://cloud.test', CLOUD_PATHS.start, { from: 'x', returnPath: bad })!).searchParams.has('return')).toBe(false)
    }
  })

  it('are nothing when hq does not know where Cloud is', () => {
    expect(cloudLinkOut(null, CLOUD_PATHS.switch, { from: 'x' })).toBeNull()
  })
})
