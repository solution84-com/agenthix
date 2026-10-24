import { describe, expect, it } from 'vitest'
import { looksLikeSecret } from '../looksLikeSecret'

// Every value here is a made-up canary in the shape of a credential, never a real one.
describe('looksLikeSecret @SC-1332', () => {
  it.each([
    ['a key file', '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----'],
    ['a key file with text before it', 'key:\n-----BEGIN RSA PRIVATE KEY-----'],
    ['a GitHub token', 'ghp_CANARYaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['a GitHub fine-grained token', 'github_pat_CANARY_0000000000'],
    ['a Slack token', 'xoxb-0000-CANARY'],
    ['an AWS access key id', 'AKIACANARY0000000000'],
    ['a GitLab token', 'glpat-CANARY000000000000'],
    ['an API key', 'sk-ant-CANARY-000000'],
    ['a long random string', 'Zx8qP2vL9mN4rT7wK1sJ6hG3fD5aY0bC'],
    ['a long hex key', 'a3f9'.repeat(16)],
  ])('flags %s', (_what, value) => {
    expect(looksLikeSecret(value)).not.toBeNull()
  })

  it.each([
    ['a host name', 'staging.example.com'],
    ['an environment', 'production'],
    ['a region', 'eu-west-2'],
    ['a URL', 'https://staging.example.com/api/v2/deploy'],
    ['a UUID', '3f2b8c1e-9d4a-4e7b-a6c5-0b1d2e3f4a5b'],
    ['a commit id', 'e83c5163316f89bfbde7d9ab23ca2e25604af290'],
    ['a sentence', 'The staging server in the London region, behind the load balancer'],
    ['a path', '/srv/apps/website/releases/current/public'],
    ['an empty value', ''],
    ['a word that starts like a prefix', 'skeleton'],
  ])('leaves %s alone', (_what, value) => {
    expect(looksLikeSecret(value)).toBeNull()
  })

  it('says why, without repeating the value', () => {
    const value = 'ghp_CANARYaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const why = looksLikeSecret(value)
    expect(why).toMatch(/GitHub/)
    expect(why).not.toContain(value)
  })
})
