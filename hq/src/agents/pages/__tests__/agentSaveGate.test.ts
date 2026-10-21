import { describe, it, expect } from 'vitest'
import {
  realBehaviourChanges, resolveAgentSave, AGENT_SAVE_REFUSAL_MESSAGE,
  resolveVoiceSave, AGENT_VOICE_SAVE_REFUSAL_MESSAGE,
} from '../agentSaveGate'

const CURRENT = {
  defaultModel: 'claude-sonnet-4-6',
  runtime: 'claude-sdk',
  approval: 'deferred',
  allowedTools: [{ name: 'Read', state: 'always' }],
  allowedBashPatterns: null,
}

describe('realBehaviourChanges', () => {
  it('is empty when every submitted field matches the current value (ConfigurationTab always resubmits all of them)', () => {
    expect(realBehaviourChanges({ ...CURRENT }, CURRENT)).toEqual({})
  })

  it('keeps only the fields whose value actually differs', () => {
    expect(realBehaviourChanges({ ...CURRENT, defaultModel: 'claude-opus-4-6' }, CURRENT))
      .toEqual({ defaultModel: 'claude-opus-4-6' })
  })

  it('compares object/array fields by content, not identity — a resubmitted equal array is not a change', () => {
    expect(realBehaviourChanges({ allowedTools: [{ name: 'Read', state: 'always' }] }, CURRENT)).toEqual({})
  })

  it('an unchanged Permissions save is not a change: [] bash patterns against a stored null, and legacy string[] permissions', () => {
    expect(realBehaviourChanges({ allowedBashPatterns: [] }, CURRENT)).toEqual({})
    const legacy = { ...CURRENT, allowedTools: ['Read'], allowedBashPatterns: ['npm test'] }
    expect(realBehaviourChanges({
      allowedTools: [{ name: 'Read', state: 'always' }],
      allowedBashPatterns: [{ pattern: 'npm test', state: 'always' }],
    }, legacy)).toEqual({})
    expect(resolveAgentSave({ allowedTools: [{ name: 'Read', state: 'always' }], allowedBashPatterns: [] }, CURRENT, true))
      .toEqual({ kind: 'identity-only' })
  })

  it('still sees a real permission change against a legacy value', () => {
    const legacy = { ...CURRENT, allowedTools: ['Read'] }
    const next = [{ name: 'Read', state: 'never' }]
    expect(realBehaviourChanges({ allowedTools: next }, legacy)).toEqual({ allowedTools: next })
    expect(realBehaviourChanges({ allowedBashPatterns: [{ pattern: 'ls', state: 'always' }] }, CURRENT))
      .toEqual({ allowedBashPatterns: [{ pattern: 'ls', state: 'always' }] })
  })

  it('a genuinely different allowedTools list is kept', () => {
    const nextTools = [{ name: 'Read', state: 'always' }, { name: 'Bash', state: 'never' }]
    expect(realBehaviourChanges({ allowedTools: nextTools }, CURRENT)).toEqual({ allowedTools: nextTools })
  })

  it('ignores a field the caller never sent (undefined)', () => {
    expect(realBehaviourChanges({ approval: undefined }, CURRENT)).toEqual({})
  })

  it('a single-field change (approval) is picked up on its own', () => {
    expect(realBehaviourChanges({ approval: 'immediate' }, CURRENT)).toEqual({ approval: 'immediate' })
  })
})

describe('resolveAgentSave', () => {
  it('is identity-only for an org admin when nothing behavioural actually changed', () => {
    expect(resolveAgentSave({ ...CURRENT }, CURRENT, true)).toEqual({ kind: 'identity-only' })
  })

  // R-195: a rename is an admin's act too, and a save that
  // resubmits every current value still carries the name.
  it('refuses a non-admin outright even when no behaviour field changed (a rename)', () => {
    expect(resolveAgentSave({ ...CURRENT }, CURRENT, false))
      .toEqual({ kind: 'refused', message: AGENT_SAVE_REFUSAL_MESSAGE })
    expect(resolveAgentSave({}, CURRENT, false))
      .toEqual({ kind: 'refused', message: AGENT_SAVE_REFUSAL_MESSAGE })
  })

  it('names the role needed in the refusal', () => {
    expect(AGENT_SAVE_REFUSAL_MESSAGE).toContain('ADMIN')
    expect(AGENT_VOICE_SAVE_REFUSAL_MESSAGE).toContain('ADMIN')
  })

  it('saves the real diff when the caller is an org admin', () => {
    expect(resolveAgentSave({ ...CURRENT, approval: 'immediate' }, CURRENT, true))
      .toEqual({ kind: 'save', change: { approval: 'immediate' } })
  })

  it('refuses a real behaviour change from a non-admin, before anything is written', () => {
    expect(resolveAgentSave({ ...CURRENT, approval: 'immediate' }, CURRENT, false))
      .toEqual({ kind: 'refused', message: AGENT_SAVE_REFUSAL_MESSAGE })
  })
})

// Unlike behaviour fields, updateAgentVoice has no identity-only subset — every
// call is an org-admin act (server floor: ADMIN) — so the gate is a plain
// admin check rather than a diff, but it is the same shape as resolveAgentSave:
// refuse client-side, before the network call, rather than let the server 403
// a control the page still renders.
describe('resolveVoiceSave', () => {
  it('refuses a non-admin, before anything is written', () => {
    expect(resolveVoiceSave(false)).toEqual({ kind: 'refused', message: AGENT_VOICE_SAVE_REFUSAL_MESSAGE })
  })

  it('lets an org admin through', () => {
    expect(resolveVoiceSave(true)).toEqual({ kind: 'ok' })
  })
})
