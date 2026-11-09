/** A recorded-shape sample of Inworld's model list (unit findings §6), written by hand, never fetched. */
import { parseInworldModels } from '@agenthix/core'

const text = { inputModalities: ['text', 'image'], outputModalities: ['text'] }
const tools = { functionCalling: true }

export const INWORLD_BODY = {
  models: [
    { model: 'claude-sonnet-5-5', provider: 'anthropic', modelCreator: 'Anthropic', isSupported: true,
      pricing: { promptToken: 3e-6, completionToken: 1.5e-5, promptCacheReadToken: 3e-7, promptCacheWriteToken: 3.75e-6 },
      spec: { ...text, contextLength: 1000000, capabilities: { ...tools, vision: true, reasoning: true, promptCaching: true } } },
    { model: 'claude-sonnet-5', provider: 'anthropic', modelCreator: 'Anthropic', isSupported: true,
      pricing: { promptToken: 3e-6, completionToken: 1.5e-5, promptCacheReadToken: 3e-7, promptCacheWriteToken: 3.75e-6 },
      spec: { ...text, capabilities: tools } },
    { model: 'claude-haiku-5-5', provider: 'anthropic', modelCreator: 'Anthropic', isSupported: true,
      pricing: { promptToken: 1e-7, completionToken: 5e-7, promptCacheReadToken: 1e-8, promptCacheWriteToken: 1.25e-7 },
      spec: { ...text, capabilities: tools } },
    { model: 'models/deepseek-v4-flash', provider: 'inworld', modelCreator: 'DeepSeek', isSupported: true,
      pricing: { promptToken: 1.4e-7, completionToken: 2.8e-7 },
      spec: { inputModalities: ['text'], outputModalities: ['text'], capabilities: tools } },
    { model: 'gemini-3-1-pro', provider: 'google-ai-studio', modelCreator: 'Google', isSupported: true,
      pricing: { promptToken: 2e-6, completionToken: 1.2e-5 }, spec: { ...text, capabilities: tools } },
    { model: 'gpt-5.4-nano', provider: 'openai', modelCreator: 'OpenAI', isSupported: true,
      pricing: { promptToken: 2e-7, completionToken: 1.25e-6, promptCacheReadToken: 2e-8 }, spec: { ...text, capabilities: tools } },
    { model: 'gpt-image-2', provider: 'openai', modelCreator: 'OpenAI', isSupported: true,
      pricing: { promptToken: 5e-6, completionToken: 4e-5 }, spec: { outputModalities: ['image'], capabilities: { functionCalling: false } } },
    { model: 'qwen3guard-gen-8b', provider: 'deepinfra', modelCreator: 'Alibaba', isSupported: true,
      pricing: { promptToken: 1e-8, completionToken: 1e-8 }, spec: { outputModalities: ['text'], capabilities: { functionCalling: false } } },
    { model: 'bare-model', provider: 'mistral', spec: { capabilities: tools } },
    null,
  ],
}

export const INWORLD_MODELS = parseInworldModels(INWORLD_BODY)
