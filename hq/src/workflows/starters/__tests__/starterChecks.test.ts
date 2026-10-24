import { describe, expect, it } from 'vitest'
import { checkFlags } from '../../checks'
import { STARTERS_AT_CONNECT, setGitHubSecretsSource, starterSource } from '../definitions'
import { starterVersionContent } from '../content'

const DIGEST = `sha256:${'1'.repeat(64)}`
const flagsOf = (c: ReturnType<typeof starterVersionContent>) => checkFlags(c, null, { known: false })

describe('the starter workflows under the plain checks', () => {
  it('push raises no flag', () => {
    expect(flagsOf(starterVersionContent(starterSource('push'), DIGEST))).toEqual([])
  })

  it('open-pull-request raises no flag: the title and body are read as one quoted argument and a file', () => {
    expect(flagsOf(starterVersionContent(starterSource('open-pull-request'), DIGEST))).toEqual([])
  })

  it('pull raises only rule 12, about the bundle its token step hands on, and no rule 10: git with the token runs in a new repository', () => {
    const flags = flagsOf(starterVersionContent(starterSource('pull'), DIGEST))
    expect(flags.map((f) => f.rule)).toEqual([12])
    // High because a later step with the same hosts reads /run/out. The bundle holds only objects git fetched from
    // the repository: the token reaches git through gh's credential helper, never a file.
    expect(flags[0]).toMatchObject({ high: true, path: 'fetch-branch.sh' })
    expect(flags.filter((f) => f.rule === 10 || f.rule === 9 || f.rule === 1)).toEqual([])
  })

  it('set-github-secrets gives each step only the token and its own secret, sets environment secrets, and raises no flag', () => {
    const content = starterVersionContent(setGitHubSecretsSource(['DEPLOY_KEY', 'NPM_TOKEN'])!, DIGEST, ['DEPLOY_KEY', 'NPM_TOKEN'])
    expect(content.definition.steps.map((s) => s.secrets)).toEqual([['DEPLOY_KEY', 'GITHUB_TOKEN'], ['GITHUB_TOKEN', 'NPM_TOKEN']])
    for (const s of content.definition.steps) expect(s.run).toMatch(/gh secret set [A-Z_]+ --repo "\$GITHUB_REPOSITORY" --env /)
    expect(flagsOf(content)).toEqual([])
  })

  it('open-pull-request reads the code as well, since gh pr create first reads the default branch', () => {
    expect(starterVersionContent(starterSource('open-pull-request'), DIGEST).definition.github).toEqual({ pull_requests: 'write', contents: 'read' })
  })

  it('set-github-secrets has no definition with no names', () => {
    expect(setGitHubSecretsSource([])).toBeNull()
  })

  it('every starter parses, needs only GitHub\'s two hosts, and declares its permissions', () => {
    for (const name of STARTERS_AT_CONNECT) {
      const { definition } = starterVersionContent(starterSource(name), DIGEST)
      expect(definition.hosts.map((h) => `${h.host}:${h.port}`)).toEqual(['api.github.com:443', 'github.com:443'])
      expect(Object.keys(definition.github).length).toBeGreaterThan(0)
    }
  })

  it('the names chosen are part of the hash', async () => {
    const { starterContent } = await import('../content')
    const a = await starterContent(setGitHubSecretsSource(['A_KEY'])!, DIGEST, ['A_KEY'])
    const b = await starterContent(setGitHubSecretsSource(['A_KEY'])!, DIGEST, [])
    expect(a.hash).not.toBe(b.hash)
  })
})
