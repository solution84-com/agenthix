import type { AiProviderVendor } from '../providers/providers.js'

/** Who makes a model whose vendor's name carries no maker. */
const OWN_MAKER: Partial<Record<AiProviderVendor, string>> = { anthropic: 'anthropic', openai: 'openai', google: 'google' }

/** A provider-listed maker prefix read as the maker's own name (Inworld lists Google's models as `google-ai-studio/…`). */
const MAKER_ALIAS: Record<string, string> = { 'google-ai-studio': 'google', xai: 'x-ai', mistral: 'mistralai', meta: 'meta-llama',
  // Names Inworld's hosts and creators give the same makers other providers use (`deepseek-ai/…` is DeepSeek's).
  'deepseek-ai': 'deepseek', 'zai-org': 'z-ai', zai: 'z-ai', 'meta-models': 'meta-llama', minimaxai: 'minimax', 'moonshot-ai': 'moonshotai',
}

/**
 * Inworld's `modelCreator` (display form) as the maker slug OpenRouter's ids use, so a pattern by maker (`qwen/*`) matches
 * the same model on both. A creator not listed becomes its lower-case words joined by hyphens.
 */
const CREATOR_MAKER: Record<string, string> = {
  anthropic: 'anthropic', openai: 'openai', google: 'google', deepseek: 'deepseek', alibaba: 'qwen', meta: 'meta-llama',
  kimi: 'moonshotai', 'moonshot ai': 'moonshotai', 'z ai': 'z-ai', 'zai org': 'z-ai', 'z.ai': 'z-ai',
  'deepseek ai': 'deepseek', 'meta models': 'meta-llama', 'meta llama': 'meta-llama', minimaxai: 'minimax', mistral: 'mistralai', xai: 'x-ai', minimax: 'minimax', nvidia: 'nvidia', xiaomi: 'xiaomi',
}

export function makerOfCreator(creator: string): string {
  const key = creator.trim().toLowerCase()
  const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return CREATOR_MAKER[key] ?? MAKER_ALIAS[slug] ?? slug
}

/** Hosts that serve other makers' models: their id carries the maker after the host, or `models/` for their own. */
const RE_HOSTS = new Set(['inworld', 'groq', 'deepinfra', 'gmicloud'])

const alias = (maker: string) => MAKER_ALIAS[maker.toLowerCase()] ?? maker

/**
 * A model as Inworld lists it, `<host>/<model>`: the host is the maker for Anthropic, OpenAI, Google (`google-ai-studio`),
 * DeepSeek, xAI, Mistral and Meta; a re-host (Inworld's own, Groq, DeepInfra) names the maker inside the model
 * (`groq/openai/gpt-oss-20b`) or, for `inworld/models/<name>`, only in the list's `creator`.
 */
function inworldMakerAndName(model: string, creator?: string | null): string {
  const slash = model.indexOf('/')
  if (slash < 0) return `inworld/${model}`
  const host = model.slice(0, slash)
  const rest = model.slice(slash + 1)
  if (rest.startsWith('models/')) {
    const name = rest.slice('models/'.length)
    return `${creator ? makerOfCreator(creator) || host : alias(host)}/${name}`
  }
  const inner = rest.indexOf('/')
  if (inner > 0) return `${alias(rest.slice(0, inner))}/${rest.slice(inner + 1)}`
  return `${RE_HOSTS.has(host) && creator ? makerOfCreator(creator) || alias(host) : alias(host)}/${rest}`
}

/** The maker and the model's name (`anthropic/claude-sonnet-5`), what lists and families match. */
export function makerAndName(vendor: AiProviderVendor, model: string, creator?: string | null): string {
  if (vendor === 'inworld') return inworldMakerAndName(model, creator)
  const own = OWN_MAKER[vendor]
  if (own) return `${own}/${model}`
  if (model.includes('/')) {
    const id = model.replace(/^~/, '')
    const maker = id.slice(0, id.indexOf('/'))
    return MAKER_ALIAS[maker] ? `${MAKER_ALIAS[maker]}${id.slice(maker.length)}` : id
  }
  return `${vendor}/${model}`
}

/** The same model on any provider, with OpenRouter's dotted versions read as hyphenated ones. */
export function sameModelKey(vendor: AiProviderVendor, model: string, creator?: string | null): string {
  return makerAndName(vendor, model, creator).toLowerCase().replace(/\./g, '-')
}
