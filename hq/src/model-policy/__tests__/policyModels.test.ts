import { describe, it, expect } from 'vitest'
import {
  effectivePolicy, isWithinPolicy, policyFromRow, policyModelLabel, providerOfPolicyModel, validateModelPolicy,
  ModelPolicyValidationError, type ModelPolicyValues,
} from '../policyModels'

const OPUS = 'claude-opus-5' // rank 148
const SONNET = 'claude-sonnet-5' // rank 137
const HAIKU = 'claude-haiku-4-5' // rank 128
const GPT = 'openai/gpt-4.1' // rank 134
const GPT_MINI = 'openai/gpt-4.1-mini' // rank 79
const AGENT = { defaultModel: SONNET }

const none: ModelPolicyValues = { talking: null, lightWork: null, heavyWork: null, allowed: null, ceiling: null }
const policy = (values: Partial<ModelPolicyValues>): ModelPolicyValues => ({ ...none, ...values })

describe('a policy model @SC-954', () => {
  it('names its provider as the runtimes write it', () => {
    expect(providerOfPolicyModel(SONNET)).toBe('anthropic')
    expect(providerOfPolicyModel('anthropic/claude-sonnet-5')).toBe('anthropic')
    expect(providerOfPolicyModel(GPT)).toBe('openai')
    expect(providerOfPolicyModel('openai_compatible/llama')).toBe('openai_compatible')
    expect(providerOfPolicyModel('mistral/large')).toBeNull()
  })

  it('is read by its catalogue label', () => {
    expect(policyModelLabel(SONNET)).toBe('Claude Sonnet 5')
    expect(policyModelLabel('openai_compatible/llama')).toBe('openai_compatible/llama')
  })

  it('is within a ceiling when it costs the same or less, across providers', () => {
    expect(isWithinPolicy(HAIKU, { allowed: null, ceiling: SONNET })).toBe(true)
    expect(isWithinPolicy(SONNET, { allowed: null, ceiling: SONNET })).toBe(true)
    expect(isWithinPolicy(OPUS, { allowed: null, ceiling: SONNET })).toBe(false)
    expect(isWithinPolicy(GPT, { allowed: null, ceiling: SONNET })).toBe(true)
    expect(isWithinPolicy('nobody-knows', { allowed: null, ceiling: SONNET })).toBe(false)
  })

  it('is within an allow-list only when it is on it', () => {
    expect(isWithinPolicy(GPT, { allowed: [SONNET], ceiling: null })).toBe(false)
    expect(isWithinPolicy(SONNET, { allowed: [SONNET], ceiling: null })).toBe(true)
  })
})

describe('validating a policy @SC-954', () => {
  it('keeps what is valid, trimming and removing repeats', () => {
    expect(validateModelPolicy({ talking: ` ${SONNET} `, allowed: [SONNET, HAIKU, SONNET], ceiling: SONNET }))
      .toEqual(policy({ talking: SONNET, allowed: [SONNET, HAIKU], ceiling: SONNET }))
  })

  it('reads an empty allow-list as none', () => {
    expect(validateModelPolicy({ allowed: [] }).allowed).toBeNull()
  })

  it.each([
    [{ talking: 'nobody-knows' }, "is not a model"],
    [{ talking: '' }, 'is not a model'],
    [{ allowed: 'claude-sonnet-5' }, 'must be a list'],
    [{ talking: OPUS, ceiling: SONNET }, 'not within'],
    [{ heavyWork: GPT, allowed: [SONNET] }, 'not within'],
    [{ ceiling: 'openai_compatible/llama', talking: OPUS }, 'not within'],
  ])('refuses %j', (raw, message) => {
    expect(() => validateModelPolicy(raw)).toThrow(ModelPolicyValidationError)
    expect(() => validateModelPolicy(raw)).toThrow(message)
  })
})

describe("validating a policy under the organisation's bound @SC-954", () => {
  const org = { allowed: [SONNET, HAIKU, GPT], ceiling: SONNET }

  it('accepts one that narrows it', () => {
    expect(validateModelPolicy({ talking: HAIKU, allowed: [HAIKU, SONNET], ceiling: HAIKU }, org))
      .toEqual(policy({ talking: HAIKU, allowed: [HAIKU, SONNET], ceiling: HAIKU }))
  })

  it.each([
    [{ ceiling: OPUS }, "above the organisation's ceiling"],
    [{ allowed: [SONNET, OPUS] }, "not among the organisation's allowed models"],
    [{ talking: GPT_MINI }, "not within the organisation's allowed models and ceiling"],
    [{ heavyWork: OPUS }, "not within the organisation's allowed models and ceiling"],
  ])('refuses %j, saying why', (raw, message) => {
    expect(() => validateModelPolicy(raw, org)).toThrow(ModelPolicyValidationError)
    expect(() => validateModelPolicy(raw, org)).toThrow(message)
  })
})

describe('a stored policy read back @SC-954', () => {
  it('reads a malformed allow-list as none', () => {
    expect(policyFromRow({ ...none, allowed: { not: 'a list' } }).allowed).toBeNull()
    expect(policyFromRow({ ...none, allowed: [1, 2] }).allowed).toBeNull()
    expect(policyFromRow({ ...none, allowed: [SONNET] }).allowed).toEqual([SONNET])
  })
})

describe('the effective policy @SC-954', () => {
  it("is the agent's default model where no layer says", () => {
    expect(effectivePolicy([null, null], AGENT)).toEqual({
      talking: SONNET, lightWork: SONNET, heavyWork: SONNET, allowed: null, ceiling: null,
    })
  })

  it('takes each field from the nearest layer that sets it', () => {
    const own = policy({ talking: HAIKU })
    const org = policy({ talking: OPUS, heavyWork: OPUS, lightWork: GPT_MINI })
    expect(effectivePolicy([own, org], AGENT)).toMatchObject({ talking: HAIKU, lightWork: GPT_MINI, heavyWork: OPUS })
  })

  it("keeps each model within the nearest allow-list and ceiling, falling to the next layer's", () => {
    const own = policy({ talking: OPUS, ceiling: SONNET })
    const org = policy({ talking: HAIKU, heavyWork: OPUS })
    expect(effectivePolicy([own, org], AGENT)).toEqual({
      talking: HAIKU, lightWork: SONNET, heavyWork: SONNET, allowed: null, ceiling: SONNET,
    })
  })

  it("holds the organisation's allow-list and ceiling as a bound a nearer layer can only narrow", () => {
    const own = policy({ talking: OPUS, allowed: [OPUS, SONNET, GPT, HAIKU], ceiling: OPUS })
    const org = policy({ allowed: [SONNET, HAIKU, GPT_MINI], ceiling: SONNET })
    expect(effectivePolicy([own, org], AGENT)).toEqual({
      talking: SONNET, lightWork: SONNET, heavyWork: SONNET, allowed: [SONNET, HAIKU], ceiling: SONNET,
    })
  })

  it("takes the stricter ceiling, whichever layer sets it", () => {
    const own = policy({ ceiling: HAIKU })
    const org = policy({ ceiling: SONNET, talking: SONNET })
    expect(effectivePolicy([own, org], { defaultModel: HAIKU })).toMatchObject({ talking: HAIKU, ceiling: HAIKU })
  })

  it('falls to the first allowed model when no layer names one the allow-list admits', () => {
    const org = policy({ allowed: [GPT_MINI, GPT] })
    expect(effectivePolicy([null, org], AGENT)).toMatchObject({ talking: GPT_MINI, lightWork: GPT_MINI, allowed: [GPT_MINI, GPT] })
  })
})
