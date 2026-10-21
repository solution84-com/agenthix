/**
 * The one credential a run may use (spec §6.3, adr-0105), against the real
 * test database: a person's own run, a project's run — the project's, then its
 * person's, then the org's — and the org's alone, the subscription-before-key
 * order within one owner, the one-person rule for a shared subscription, a
 * person's login only in their own harness home, and what a run is told when
 * nothing is usable.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

import { resolveRunCredential, runInOwnHome as own, type RunPerson } from '../modelCredential'
import { SDK, OPENCODE, SDK_MODEL, OC_ANTHROPIC, storeKey, storeSubscription, orgKey, peopleInOrg } from './runCredentialFixtures'

const orgApiKey = { kind: 'apiKey', provider: 'anthropic', apiKey: 'org-key' }
const subscription = (oauthJson = 'oauth-json') => ({ kind: 'subscription', provider: 'anthropic', oauthJson })

/** A task's run in a project, on behalf of `personId`: it runs as the project, not in the person's own home. */
const taskRunFor = (personId: string): RunPerson => ({ personId, runnerPersonId: null })

beforeEach(async () => {
  // The integration run takes hq's .env.server as its base, which may turn the development switch on.
  vi.stubEnv('HQ_DEV_SHARED_SUBSCRIPTION', '')
  await peopleInOrg(1)
  await orgKey('anthropic', 'org-key')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("a person's run @SC-701", () => {
  const boundary = { type: 'user', id: 'u1' } as const

  it('uses their accepted subscription on the Claude SDK runtime, ahead of their own key', async () => {
    await storeSubscription('user', 'u1')
    await storeKey('user', 'u1', 'personal-api-key')
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: subscription(), problem: null })
  })

  it('skips the subscription on the OpenCode runtime and uses their own API key', async () => {
    await storeSubscription('user', 'u1')
    await storeKey('user', 'u1', 'personal-api-key')
    await expect(resolveRunCredential(boundary, own('u1'), OPENCODE, OC_ANTHROPIC))
      .resolves.toEqual({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'personal-api-key' }, problem: null })
  })

  it('ignores a subscription with no acceptance recorded, falling to the org key', async () => {
    await storeSubscription('user', 'u1', 'oauth-json', { accepted: false })
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })

  it("uses their own subscription in an org of five people — a person's own works at any size", async () => {
    await peopleInOrg(5)
    await storeSubscription('user', 'u1')
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: subscription(), problem: null })
  })

  it.each([
    ['for someone else', own('u2')],
    ['for nobody named', null],
    ['not in their own home', taskRunFor('u1')],
  ] as const)('never reaches their subscription when the run is %s', async (_who, person) => {
    await storeSubscription('user', 'u1')
    await expect(resolveRunCredential(boundary, person, SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })

  it('is paid for by nobody else: a run there for another person never uses the owner\'s own key', async () => {
    await storeKey('user', 'u1', 'personal-api-key')
    await expect(resolveRunCredential(boundary, own('u2'), SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })

  it("falls to the org's own subscription only after their own credentials, and only while the org has one person", async () => {
    await prisma.provider.deleteMany()
    await storeSubscription('org', 'org', 'org-oauth')
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: subscription('org-oauth'), problem: null })
  })
})

describe('a project run or a task @SC-701 @SC-702', () => {
  const boundary = { type: 'project', id: 'p1' } as const

  it("uses the project's subscription in a one-person org, and it beats the project's own key", async () => {
    await storeSubscription('project', 'p1', 'project-oauth')
    await storeKey('project', 'p1', 'boundary-key')
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: subscription('project-oauth'), problem: null })
  })

  it("uses the project's key, not its subscription, in a two-person org", async () => {
    await peopleInOrg(2)
    await storeSubscription('project', 'p1')
    await storeKey('project', 'p1', 'boundary-key')
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL))
      .resolves.toEqual({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'boundary-key' }, problem: null })
  })

  describe('with the development switch for a shared subscription @SC-704', () => {
    beforeEach(() => vi.stubEnv('HQ_DEV_SHARED_SUBSCRIPTION', 'true'))

    it("uses the project's subscription in a two-person org when the switch is on outside production", async () => {
      vi.stubEnv('NODE_ENV', 'development')
      await peopleInOrg(2)
      await storeSubscription('project', 'p1', 'project-oauth')
      await expect(resolveRunCredential(boundary, taskRunFor('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: subscription('project-oauth'), problem: null })
    })

    it('ignores the switch in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      await peopleInOrg(2)
      await storeSubscription('project', 'p1')
      await storeKey('project', 'p1', 'boundary-key')
      await expect(resolveRunCredential(boundary, taskRunFor('u1'), SDK, SDK_MODEL))
        .resolves.toEqual({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'boundary-key' }, problem: null })
    })

    it("never gives a person's own subscription to someone else", async () => {
      vi.stubEnv('NODE_ENV', 'development')
      await storeSubscription('user', 'u2')
      const { credential } = await resolveRunCredential({ type: 'user', id: 'u2' }, own('u1'), SDK, SDK_MODEL)
      expect(credential).toEqual(orgApiKey)
      const inTask = await resolveRunCredential(boundary, taskRunFor('u2'), SDK, SDK_MODEL)
      expect(inTask.credential).toEqual(orgApiKey)
    })
  })

  it('falls to the org key when the project holds only a subscription and the org has two people', async () => {
    await peopleInOrg(2)
    await storeSubscription('project', 'p1')
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })

  it("uses the project's own key on the OpenCode runtime, whatever subscription it holds", async () => {
    await storeSubscription('project', 'p1')
    await storeKey('project', 'p1', 'boundary-key')
    await expect(resolveRunCredential(boundary, own('u1'), OPENCODE, OC_ANTHROPIC))
      .resolves.toEqual({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'boundary-key' }, problem: null })
  })

  it('ignores a project subscription with no acceptance recorded', async () => {
    await storeSubscription('project', 'p1', 'oauth-json', { accepted: false })
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })

  it("uses the project's own key ahead of its person's own login", async () => {
    await storeKey('project', 'p1', 'boundary-key')
    await storeSubscription('user', 'u1', 'person-oauth')
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL))
      .resolves.toEqual({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'boundary-key' }, problem: null })
  })

  it("skips the project's subscription in a two-person org and uses its person's own login", async () => {
    await peopleInOrg(2)
    await storeSubscription('project', 'p1', 'project-oauth')
    await storeSubscription('user', 'u1', 'person-oauth')
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: subscription('person-oauth'), problem: null })
  })

  it("uses its person's login, then their key, then the org's, when the project holds nothing", async () => {
    const login = await storeSubscription('user', 'u1', 'person-oauth')
    await storeKey('user', 'u1', 'person-key')
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: subscription('person-oauth'), problem: null })

    await prisma.modelCredential.delete({ where: { id: login.id } })
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL))
      .resolves.toEqual({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'person-key' }, problem: null })

    await prisma.modelCredential.deleteMany({ where: { ownerType: 'user' } })
    await expect(resolveRunCredential(boundary, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })

  it("uses the key, never the login, of the person a task's run is for: it runs as the project @SC-703", async () => {
    await storeSubscription('user', 'u1', 'person-oauth')
    await storeKey('user', 'u1', 'person-key')
    await expect(resolveRunCredential(boundary, taskRunFor('u1'), SDK, SDK_MODEL))
      .resolves.toEqual({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'person-key' }, problem: null })
  })

  it("never hands one person's login to a run in another person's home", async () => {
    await storeSubscription('user', 'u1', 'person-oauth')
    await expect(resolveRunCredential(boundary, { personId: 'u1', runnerPersonId: 'u2' }, SDK, SDK_MODEL))
      .resolves.toEqual({ credential: orgApiKey, problem: null })
    await expect(resolveRunCredential(boundary, own('u2'), SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })

  it('uses only the org\'s for a run on behalf of nobody', async () => {
    await storeKey('user', 'u1', 'person-key')
    await expect(resolveRunCredential(boundary, null, SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })
})

describe('the org level — a run with no boundary @SC-701', () => {
  it('uses the org subscription in a one-person org, ahead of the org API key', async () => {
    await storeSubscription('org', 'org', 'org-oauth')
    await expect(resolveRunCredential(null, null, SDK, SDK_MODEL)).resolves.toEqual({ credential: subscription('org-oauth'), problem: null })
  })

  it('uses the org API key when there is no subscription', async () => {
    await expect(resolveRunCredential(null, null, SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })

  it('uses the org API key on the OpenCode runtime, whatever subscription the org holds', async () => {
    await storeSubscription('org', 'org')
    await expect(resolveRunCredential(null, null, OPENCODE, OC_ANTHROPIC)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })

  it('refuses when only an org subscription exists and the org has two people, and says why', async () => {
    await peopleInOrg(2)
    await prisma.provider.deleteMany()
    await storeSubscription('org', 'org')

    const result = await resolveRunCredential(null, null, SDK, SDK_MODEL)

    expect(result.credential).toBeNull()
    expect(result.problem).toContain('more than one person')
    expect(result.problem).toContain('Organisation › Settings › Model access')
  })

  it('counts the people at most once per resolution, and names each subscription it skipped', async () => {
    await peopleInOrg(2)
    await prisma.provider.deleteMany()
    await storeSubscription('project', 'p1')
    await storeSubscription('org', 'org')
    const count = vi.spyOn(prisma.user, 'count')

    const result = await resolveRunCredential({ type: 'project', id: 'p1' }, own('u1'), SDK, SDK_MODEL)

    expect(count).toHaveBeenCalledTimes(1)
    expect(result.problem).toContain("project's Claude subscription")
    expect(result.problem).toContain("organisation's Claude subscription")
  })

  it('does not count the people when no shared subscription exists', async () => {
    const count = vi.spyOn(prisma.user, 'count')
    await resolveRunCredential(null, null, SDK, SDK_MODEL)
    expect(count).not.toHaveBeenCalled()
  })
})

describe('a run with nothing usable anywhere @SC-706', () => {
  beforeEach(async () => {
    await prisma.provider.deleteMany()
  })

  it("points a person at their Settings and the org's Model access", async () => {
    const { credential, problem } = await resolveRunCredential({ type: 'user', id: 'u1' }, own('u1'), SDK, SDK_MODEL)
    expect(credential).toBeNull()
    expect(problem).toContain('Settings › Your model logins')
    expect(problem).toContain('Organisation › Settings › Model access')
  })

  it("says the order for a project run, and points at the person's own logins, the project's settings and the org's", async () => {
    const { credential, problem } = await resolveRunCredential({ type: 'project', id: 'p1' }, own('u1'), SDK, SDK_MODEL)
    expect(credential).toBeNull()
    expect(problem).toContain("uses the project's own model access first, then the person it is for")
    expect(problem).toContain('Settings › Your model logins')
    expect(problem).toContain("this project's API key")
    expect(problem).toContain('Organisation › Settings › Model access')
    expect(problem).not.toContain('Your own Claude login is not used')
  })

  it("says why the person's own login was not used for a task's run in a project", async () => {
    await storeSubscription('user', 'u1')
    const { credential, problem } = await resolveRunCredential({ type: 'project', id: 'p1' }, taskRunFor('u1'), SDK, SDK_MODEL)
    expect(credential).toBeNull()
    expect(problem).toContain("Your own Claude login is not used for a task's runs in a project")
  })

  it('points the org level at Model Access, for a run with no boundary, and does not blame the several-people rule', async () => {
    const result = await resolveRunCredential(null, null, SDK, SDK_MODEL)
    expect(result.credential).toBeNull()
    expect(result.problem).toContain('Organisation › Settings › Model access')
    expect(result.problem).not.toContain('profile')
    expect(result.problem).not.toContain('more than one person')
  })
})

describe('the problem', () => {
  it('is null whenever a credential is returned', async () => {
    await peopleInOrg(2)
    await storeSubscription('project', 'p1')

    const skippedThenKey = await resolveRunCredential({ type: 'project', id: 'p1' }, own('u1'), SDK, SDK_MODEL)
    const noBoundary = await resolveRunCredential(null, null, SDK, SDK_MODEL)

    expect(skippedThenKey).toEqual({ credential: orgApiKey, problem: null })
    expect(noBoundary).toEqual({ credential: orgApiKey, problem: null })
  })
})

describe('a credential stored in the clear @SC-704', () => {
  it("is not used: the run falls through to the org's key as if it were absent", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await storeSubscription('user', 'u1', '{"claudeAiOauth":{}}', { plain: true })
    await storeKey('user', 'u1', 'sk-ant-plain', { plain: true })

    await expect(resolveRunCredential({ type: 'user', id: 'u1' }, own('u1'), SDK, SDK_MODEL)).resolves.toEqual({ credential: orgApiKey, problem: null })
  })
})
