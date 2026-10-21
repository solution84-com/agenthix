import { describe, it, expect } from 'vitest'
import { canonicalGitHubRepoUrl } from '../canonicalRepoUrl'

describe('canonicalGitHubRepoUrl', () => {
  it.each([
    'https://github.com/acme/store',
    'https://github.com/acme/store.git',
    'https://github.com/acme/store/',
    'http://github.com/acme/store',
    'https://www.github.com/acme/store',
    'http://www.github.com/acme/store.git',
    'HTTPS://GitHub.com/acme/store',
    'git@github.com:acme/store.git',
    'git@github.com:acme/store',
    'ssh://git@github.com/acme/store.git',
    '  https://github.com/acme/store  ',
  ])('rewrites %j to the canonical form', (raw) => {
    expect(canonicalGitHubRepoUrl(raw)).toBe('https://github.com/acme/store')
  })

  it('keeps the owner and name as written', () => {
    expect(canonicalGitHubRepoUrl('http://www.github.com/My-Org/My.Repo_2.git')).toBe('https://github.com/My-Org/My.Repo_2')
  })

  it.each([
    'https://evil.example/github.com/acme/store',
    'https://github.com.evil.example/acme/store',
    'https://github.com@evil.example/acme/store',
    'https://user:pw@github.com/acme/store',
    'https://github.com:443/acme/store',
    'https://github.com/acme/store?x=1',
    'https://github.com/acme/store#frag',
    'https://github.com/acme/store/extra',
    'https://github.com/acme/..',
    'https://github.com/acme/.',
    'https://github.com/-acme/store',
    'git@evil.example:acme/store',
    'file:///tmp/github.com/acme/store',
    '',
  ])('refuses %j', (raw) => {
    expect(canonicalGitHubRepoUrl(raw)).toBeNull()
  })
})
