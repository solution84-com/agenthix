/** The shape of Inworld's `GET /llm/v1alpha/models`, as measured (findings §6): a hand-written sample, never fetched. */
const text = { inputModalities: ['text', 'image'], outputModalities: ['text'] }

export const INWORLD_LIST_FIXTURE = {
  models: [
    {
      model: 'claude-sonnet-5-5', provider: 'anthropic', modelCreator: 'Anthropic',
      pricing: { promptToken: 3e-6, completionToken: 1.5e-5, promptCacheReadToken: 3e-7, promptCacheWriteToken: 3.75e-6 },
      spec: { ...text, contextLength: 1000000, capabilities: { functionCalling: true, vision: true, reasoning: true, promptCaching: true } },
      isSupported: true,
    },
    {
      model: 'claude-sonnet-5', provider: 'anthropic', modelCreator: 'Anthropic',
      pricing: { promptToken: 3e-6, completionToken: 1.5e-5, promptCacheReadToken: 3e-7, promptCacheWriteToken: 3.75e-6 },
      spec: { ...text, contextLength: 1000000, capabilities: { functionCalling: true, promptCaching: true } },
      isSupported: true,
    },
    {
      model: 'claude-haiku-5-5', provider: 'anthropic', modelCreator: 'Anthropic',
      pricing: { promptToken: 1e-7, completionToken: 5e-7, promptCacheReadToken: 1e-8, promptCacheWriteToken: 1.25e-7 },
      spec: { ...text, contextLength: 1000000, capabilities: { functionCalling: true, promptCaching: true } },
      isSupported: true,
    },
    {
      model: 'models/deepseek-v4-flash', provider: 'inworld', modelCreator: 'DeepSeek',
      pricing: { promptToken: 1.4e-7, completionToken: 2.8e-7, promptCacheReadToken: 2.8e-8 },
      spec: { inputModalities: ['text'], outputModalities: ['text'], contextLength: 65536, capabilities: { functionCalling: true } },
      isSupported: true,
    },
    {
      model: 'gemini-3-1-pro', provider: 'google-ai-studio', modelCreator: 'Google',
      pricing: { promptToken: 2e-6, completionToken: 1.2e-5, promptCacheReadToken: 2e-7 },
      spec: { ...text, contextLength: 1000000, capabilities: { functionCalling: true, vision: true } },
      isSupported: true,
    },
    {
      model: 'gpt-5.4-nano', provider: 'openai', modelCreator: 'OpenAI',
      pricing: { promptToken: 2e-7, completionToken: 1.25e-6, promptCacheReadToken: 2e-8 },
      spec: { ...text, contextLength: 400000, capabilities: { functionCalling: true } },
      isSupported: true,
    },
    {
      model: 'openai/gpt-oss-20b', provider: 'groq', modelCreator: 'OpenAI',
      pricing: { promptToken: 7.5e-8, completionToken: 3e-7 },
      spec: { inputModalities: ['text'], outputModalities: ['text'], capabilities: { functionCalling: true } },
      isSupported: true,
    },
    {
      model: 'gpt-image-2', provider: 'openai', modelCreator: 'OpenAI',
      pricing: { promptToken: 5e-6, completionToken: 4e-5 },
      spec: { inputModalities: ['text', 'image'], outputModalities: ['image'], capabilities: { functionCalling: false } },
      isSupported: true,
    },
    {
      model: 'qwen3guard-gen-8b', provider: 'deepinfra', modelCreator: 'Alibaba',
      pricing: { promptToken: 1e-8, completionToken: 1e-8 },
      spec: { inputModalities: ['text'], outputModalities: ['text'], capabilities: { functionCalling: false } },
      isSupported: true,
    },
    {
      model: 'retired-model', provider: 'openai', modelCreator: 'OpenAI',
      pricing: { promptToken: 1e-6, completionToken: 1e-6 },
      spec: { ...text, capabilities: { functionCalling: true } },
      isSupported: false,
    },
    // Optional fields missing: no creator, no price, no context length.
    { model: 'bare-model', provider: 'mistral', spec: { capabilities: { functionCalling: true } } },
    // Malformed entries: skipped.
    null, 'text', { provider: 'openai' }, { model: 42, provider: 'openai' },
  ],
}
