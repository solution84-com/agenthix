import { describe, it, expect } from 'vitest'
import {
  choosableModels, draftFromPolicy, draftProblem, emptyDraft, inheritedLabel, policyFromDraft, saveArgs,
} from '../policyFormLogic'
import type { ModelPolicyValues } from '../../policyModels'

const none: ModelPolicyValues = { talking: null, lightWork: null, heavyWork: null, allowed: null, ceiling: null }

describe('the models form draft @SC-954', () => {
  it('is empty where nothing is stored', () => {
    expect(draftFromPolicy(null)).toEqual(emptyDraft)
  })

  it('reads a stored list as restricting, and no list as all models', () => {
    expect(draftFromPolicy({ ...none, allowed: ['claude-sonnet-5'], talking: 'claude-sonnet-5' })).toMatchObject({
      restrict: true, allowed: ['claude-sonnet-5'], talking: 'claude-sonnet-5',
    })
    expect(draftFromPolicy(none).restrict).toBe(false)
  })

  it('sends a cleared row as null, so it falls to the organisation', () => {
    expect(policyFromDraft(emptyDraft)).toEqual(none)
    expect(policyFromDraft({ ...emptyDraft, lightWork: 'claude-haiku-4-5', ceiling: 'claude-opus-5' })).toEqual({
      ...none, lightWork: 'claude-haiku-4-5', ceiling: 'claude-opus-5',
    })
  })

  it('sends the list only while it restricts', () => {
    expect(policyFromDraft({ ...emptyDraft, restrict: false, allowed: ['claude-sonnet-5'] }).allowed).toBeNull()
    expect(policyFromDraft({ ...emptyDraft, restrict: true, allowed: ['claude-sonnet-5'] }).allowed).toEqual(['claude-sonnet-5'])
  })

  it('refuses an empty list that restricts before sending', () => {
    expect(draftProblem({ ...emptyDraft, restrict: true })).toMatch(/at least one/)
    expect(draftProblem({ ...emptyDraft, restrict: true, allowed: ['claude-sonnet-5'] })).toBeNull()
    expect(draftProblem(emptyDraft)).toBeNull()
  })

  it('names the project only for a project', () => {
    expect(saveArgs('project', 'p1', emptyDraft)).toMatchObject({ scope: 'project', projectId: 'p1' })
    expect('projectId' in saveArgs('user', 'p1', emptyDraft)).toBe(false)
    expect('projectId' in saveArgs('org', undefined, emptyDraft)).toBe(false)
  })
})

describe('what the empty choice shows @SC-954', () => {
  it("shows the organisation's model by its label", () => {
    expect(inheritedLabel('user', { ...none, talking: 'claude-sonnet-5' }, 'talking')).toBe("The organisation's (Claude Sonnet 5)")
    expect(inheritedLabel('project', { ...none, talking: 'claude-sonnet-5' }, 'talking')).toBe("The organisation's (Claude Sonnet 5)")
  })

  it('says each agent decides where the organisation names none', () => {
    expect(inheritedLabel('user', null, 'heavyWork')).toBe("The organisation's (each agent's own)")
    expect(inheritedLabel('user', { ...none, talking: 'claude-sonnet-5' }, 'heavyWork')).toBe("The organisation's (each agent's own)")
  })

  it("is not 'the organisation's' on the organisation's own form", () => {
    expect(inheritedLabel('org', null, 'talking')).toBe("Each agent's own")
  })
})

describe('the models that can be picked @SC-954', () => {
  it('are all ones a policy may name, each once', () => {
    const models = choosableModels()
    expect(models.length).toBeGreaterThan(0)
    expect(new Set(models.map(m => m.value)).size).toBe(models.length)
    expect(models.map(m => m.value)).toContain('claude-sonnet-5')
  })
})
