import { describe, it, expect } from 'vitest'
import type { WorkflowDefinition } from '@agenthix/core'
import { checkRunStart, type RunStartFacts } from '../runsChecks'

const project = { type: 'project' as const, id: 'p1' }

const definition: WorkflowDefinition = {
  name: 'deploy-staging',
  description: 'Deploy',
  steps: [
    { name: 'Build', run: 'npm ci', secrets: [], timeoutSeconds: null },
    { name: 'Upload', run: './deploy/upload.sh', secrets: ['STAGING_DEPLOY_KEY'], timeoutSeconds: null },
  ],
  variables: ['STAGING_HOST'],
  parameters: [{ name: 'ref', kind: 'pattern', pattern: '^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$' }],
  hosts: [],
  github: {},
  timeoutSeconds: 600,
  files: ['deploy/upload.sh'],
}

function facts(over: Partial<RunStartFacts> = {}): RunStartFacts {
  return {
    askedFrom: project,
    workflow: { name: 'deploy-staging', place: project, enabled: true, agentRunsPerHour: null },
    approved: { number: 1, definition, approvedHere: true, contentMatches: true },
    parameters: { ref: 'main' },
    agentRunsInLastHour: 0,
    secretNames: ['STAGING_DEPLOY_KEY'],
    variableNames: ['STAGING_HOST'],
    ...over,
  }
}

describe('the checks before a run', () => {
  it('lets a run of the approved version through, with its checked parameters', () => {
    expect(checkRunStart(facts())).toEqual({ ok: true, parameters: { ref: 'main' } })
  })

  it('refuses a workflow that is off', () => {
    const r = checkRunStart(facts({ workflow: { ...facts().workflow, enabled: false } }))
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(!r.ok && r.message).toMatch(/switched off.*Nothing was changed\.$/)
  })

  it('refuses a workflow with no approved version', () => {
    expect(checkRunStart(facts({ approved: null }))).toMatchObject({ ok: false, status: 409 })
  })

  it('refuses a version not approved in this place, or whose content no longer hashes as approved', () => {
    expect(checkRunStart(facts({ approved: { ...facts().approved!, approvedHere: false } }))).toMatchObject({ ok: false, status: 409 })
    expect(checkRunStart(facts({ approved: { ...facts().approved!, contentMatches: false } }))).toMatchObject({ ok: false, status: 409 })
  })

  it('refuses a run asked from another place', () => {
    expect(checkRunStart(facts({ askedFrom: { type: 'project', id: 'p2' } }))).toMatchObject({ ok: false, status: 403 })
    expect(checkRunStart(facts({ askedFrom: { type: 'user', id: 'p1' } }))).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses a bad parameter, a missing one and one the workflow has not', () => {
    const r = checkRunStart(facts({ parameters: { ref: '--force' } }))
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(!r.ok && r.message).toMatch(/doesn't match ref's pattern/)
    expect(checkRunStart(facts({ parameters: {} }))).toMatchObject({ ok: false, status: 422 })
    expect(checkRunStart(facts({ parameters: { ref: 'main', extra: 'x' } }))).toMatchObject({ ok: false, status: 422 })
  })

  it("refuses an agent past its runs for the hour, at the default and at the workflow's own limit", () => {
    expect(checkRunStart(facts({ agentRunsInLastHour: 29 })).ok).toBe(true)
    expect(checkRunStart(facts({ agentRunsInLastHour: 30 }))).toMatchObject({ ok: false, status: 429 })
    const w = { ...facts().workflow, agentRunsPerHour: 2 }
    expect(checkRunStart(facts({ workflow: w, agentRunsInLastHour: 2 }))).toMatchObject({ ok: false, status: 429 })
  })

  it('does not limit a person', () => {
    expect(checkRunStart(facts({ agentRunsInLastHour: null })).ok).toBe(true)
  })

  it('refuses when a secret or variable it names is gone, but not for an integration value', () => {
    expect(checkRunStart(facts({ secretNames: [] }))).toMatchObject({ ok: false, status: 409 })
    expect(checkRunStart(facts({ variableNames: [] }))).toMatchObject({ ok: false, status: 409 })
    const withToken = { ...definition, steps: [{ ...definition.steps[0], secrets: ['GITHUB_TOKEN'] }] }
    expect(checkRunStart(facts({ approved: { ...facts().approved!, definition: withToken } })).ok).toBe(true)
  })
})
