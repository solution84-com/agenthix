import { describe, expect, it } from 'vitest'
import { CLAUDE_SDK_MODELS, OPENCODE_MODELS } from './modelList.js'
import { defaultModelOf, newestOfFamily, type CatalogueModel } from './newestOfFamily.js'
import { DEFAULT_MODELS } from './modelList.js'

const m = (model: string, costRank: number | null = 137, releasedAt?: string): CatalogueModel => ({ model, label: model, costRank, ...(releasedAt ? { releasedAt } : {}) })
const real = (provider: string): CatalogueModel[] =>
  provider === 'anthropic'
    ? CLAUDE_SDK_MODELS.map(x => m(x.value, x.costRank, x.releasedAt))
    : OPENCODE_MODELS.filter(x => x.provider === provider).map(x => m(x.value.slice(provider.length + 1), x.costRank, x.releasedAt))

describe('the default of each vendor on the real pinned catalogue @SC-1857', () => {
  it('Anthropic: the newest Sonnet', () => {
    expect(defaultModelOf('anthropic', real('anthropic'))).toEqual({ model: 'claude-sonnet-5', family: 'claude-sonnet', fellBack: false })
  })
  it('OpenRouter: the vendor alias', () => {
    expect(defaultModelOf('openrouter', real('openrouter')).model).toBe('~anthropic/claude-sonnet-latest')
  })
  it('Inworld: the newest Sonnet of its provider/model ids, with no code change for a newer one', () => {
    const list = [m('anthropic/claude-sonnet-4-5'), m('anthropic/claude-sonnet-5-5'), m('openai/gpt-5.6'), m('anthropic/claude-opus-5')]
    expect(defaultModelOf('inworld', list)).toEqual({ model: 'anthropic/claude-sonnet-5-5', family: 'claude-sonnet', fellBack: false })
    expect(defaultModelOf('inworld', [...list, m('anthropic/claude-sonnet-6')]).model).toBe('anthropic/claude-sonnet-6')
  })
  it('OpenAI: the main GPT line, not a variant', () => {
    expect(defaultModelOf('openai', real('openai')).model).toBe('gpt-5.6')
  })
  it('Google: a Gemini Pro and no deep-research model', () => {
    const chosen = defaultModelOf('google', real('google'))
    expect(chosen.model).toBe('gemini-2.5-pro')
    expect(chosen.model).not.toMatch(/deep-research/)
    expect(chosen.fellBack).toBe(false)
  })
  it('DEFAULT_MODELS follow the catalogue @SC-1861', () => {
    expect(DEFAULT_MODELS['claude-sdk']).toBe('claude-sonnet-5')
    expect(DEFAULT_MODELS.opencode).toBe('anthropic/claude-sonnet-5')
  })
})

describe('newestOfFamily', () => {
  it('picks a newer Sonnet added to the catalogue with no code change @SC-1857', () => {
    expect(newestOfFamily('anthropic', 'claude-sonnet', [...real('anthropic'), m('claude-sonnet-5-6')]).model).toBe('claude-sonnet-5-6')
  })
  it('counts a dated and an undated id of one model once, as the undated @SC-1857', () => {
    const chosen = newestOfFamily('anthropic', 'claude-sonnet', [m('claude-sonnet-4-5-20250929'), m('claude-sonnet-4-5')])
    expect(chosen.model).toBe('claude-sonnet-4-5')
  })
  it('keeps the dated id when it is the only one @SC-1857', () => {
    expect(newestOfFamily('anthropic', 'claude-sonnet', [m('claude-sonnet-4-5-20250929')]).model).toBe('claude-sonnet-4-5-20250929')
  })
  it('reads 5-5 and 5.5 alike and orders them against 5 and 5-10 @SC-1858', () => {
    const order = (ids: string[]) => newestOfFamily('openrouter', 'claude-sonnet', ids.map(id => m(id))).model
    expect(order(['anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5.5', 'anthropic/claude-sonnet-4.6'])).toBe('anthropic/claude-sonnet-5.5')
    expect(order(['anthropic/claude-sonnet-5-5', 'anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5-10'])).toBe('anthropic/claude-sonnet-5-10')
    expect(order(['anthropic/claude-sonnet-5-5', 'anthropic/claude-sonnet-5.4'])).toBe('anthropic/claude-sonnet-5-5')
  })
  it('chooses a preview only when no stable model exists @SC-1857', () => {
    const preview = m('gemini-4-pro-preview')
    expect(newestOfFamily('google', 'gemini-pro', [preview, m('gemini-2.5-pro')]).model).toBe('gemini-2.5-pro')
    expect(newestOfFamily('google', 'gemini-pro', [preview, m('gemini-3-pro-preview')]).model).toBe('gemini-4-pro-preview')
  })
  it('prefers an OpenRouter latest alias @SC-1857', () => {
    const catalogue = [m('anthropic/claude-sonnet-9'), m('~anthropic/claude-sonnet-latest')]
    expect(newestOfFamily('openrouter', 'claude-sonnet', catalogue).model).toBe('~anthropic/claude-sonnet-latest')
  })
  it('prefers a release date over the version when every model has one @SC-1858', () => {
    const chosen = newestOfFamily('anthropic', 'claude-sonnet', [m('claude-sonnet-5', 137, '2026-01-01'), m('claude-sonnet-4-6', 137, '2026-06-01')])
    expect(chosen.model).toBe('claude-sonnet-4-6')
  })
  it('puts a higher undated version above a lower dated one, and uses the date only between equal versions @SC-1858', () => {
    const order = (list: CatalogueModel[]) => newestOfFamily('openrouter', 'claude-sonnet', list).model
    expect(order([m('anthropic/claude-sonnet-5', 137, '2026-06-29'), m('anthropic/claude-sonnet-5-5')])).toBe('anthropic/claude-sonnet-5-5')
    expect(order([m('anthropic/claude-sonnet-5-5'), m('anthropic/claude-sonnet-5', 137, '2026-06-29')])).toBe('anthropic/claude-sonnet-5-5')
    expect(order([m('anthropic/claude-sonnet-4-6', 137, '2026-12-01'), m('anthropic/claude-sonnet-5', 137, '2026-06-29'), m('anthropic/claude-sonnet-5-5')])).toBe('anthropic/claude-sonnet-5-5')
  })
  it('breaks a tie of date and version by the shorter id @SC-1858', () => {
    const list = [m('anthropic/claude-sonnet-5-0', 137, '2026-06-29'), m('anthropic/claude-sonnet-5', 137, '2026-06-29')]
    expect(newestOfFamily('openrouter', 'claude-sonnet', list).model).toBe('anthropic/claude-sonnet-5')
    expect(newestOfFamily('openrouter', 'claude-sonnet', [...list].reverse()).model).toBe('anthropic/claude-sonnet-5')
  })
  it('takes the list of Inworld as it is: the newest Sonnet, variants outside the family, Google under its maker @SC-1857', () => {
    const list = [
      m('anthropic/claude-sonnet-4-6'), m('anthropic/claude-sonnet-5'), m('anthropic/claude-sonnet-5-5'), m('anthropic/claude-haiku-5-5'),
      m('anthropic/claude-opus-5-5'), m('openai/gpt-6.1-terra'), m('openai/gpt-5.6'), m('google-ai-studio/gemini-4-argon'),
      m('google-ai-studio/gemini-3-1-pro'), m('inworld/models/deepseek-v4-flash'),
    ]
    expect(defaultModelOf('inworld', list).model).toBe('anthropic/claude-sonnet-5-5')
    expect(newestOfFamily('inworld', 'claude-sonnet', list.filter(x => /haiku|opus/.test(x.model))).fellBack).toBe(true)
    expect(newestOfFamily('inworld', 'gemini-pro', list).model).toBe('google-ai-studio/gemini-3-1-pro')
    expect(newestOfFamily('inworld', 'gpt-main', list).model).toBe('openai/gpt-5.6') // codename tiers (terra, astra) are outside the main line
  })
  it('skips specialised variants @SC-1857', () => {
    const catalogue = [m('gpt-5.9-mini'), m('gpt-5.8-codex'), m('gpt-5.7-pro'), m('gpt-realtime-2.1'), m('gpt-5.1')]
    expect(newestOfFamily('openai', 'gpt-main', catalogue).model).toBe('gpt-5.1')
  })
  it('falls back to the price band when the family has no match, and says so @SC-1859', () => {
    const catalogue = [m('a', 50), m('b', 140), m('c', 200)]
    expect(newestOfFamily('anthropic', 'claude-sonnet', catalogue)).toEqual({ model: 'b', family: null, fellBack: true })
  })
  it('falls back for a vendor with no family, and picks none from an empty catalogue @SC-1859', () => {
    expect(defaultModelOf('cloud', real('openai')).fellBack).toBe(true)
    expect(defaultModelOf('anthropic', [])).toEqual({ model: null, family: null, fellBack: true })
  })
})
