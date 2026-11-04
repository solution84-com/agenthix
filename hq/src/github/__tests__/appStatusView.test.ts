import { describe, expect, it } from 'vitest'
import { githubAppStatusView } from '../appStatusView'

const rows = [{ accountLogin: 'acme', accountType: 'Organization' }, { accountLogin: 'stranger', accountType: 'User' }]

describe('the GitHub App status', () => {
  it('lists the installing accounts for an administrator', () => {
    expect(githubAppStatusView({ slug: 'app' }, rows, true)).toEqual({
      registered: true, slug: 'app', canCreateRepos: true,
      installations: [{ login: 'acme', type: 'Organization' }, { login: 'stranger', type: 'User' }],
    })
  })

  it('gives a member the two answers they need and no account names', () => {
    expect(githubAppStatusView({ slug: 'app' }, rows, false)).toEqual({ registered: true, slug: 'app', installations: [], canCreateRepos: true })
  })

  it('says not registered without an App', () => {
    expect(githubAppStatusView(null, [], true)).toEqual({ registered: false })
  })
})
