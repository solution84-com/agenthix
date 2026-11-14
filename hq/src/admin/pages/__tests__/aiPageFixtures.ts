/** The providers and settings the AI page's tests draw. No test calls a vendor. */
import type { AiProviderSummary } from '@agenthix/core'

export const anthropic: AiProviderSummary = {
  id: 'p1', name: 'Anthropic', vendor: 'anthropic', types: ['llm'], credential: 'api_key', baseUrl: null, keyHint: 'a3f9',
  state: 'works', stateSince: '2026-10-12T09:00:00Z', stateDetail: null, lastCheckedAt: null, lastWorkedAt: null,
  usedBy: { defaults: ['conversation'], agents: [] }, costThisMonth: [], createdAt: '2026-10-12T09:00:00Z',
}
export const assembly: AiProviderSummary = {
  ...anthropic, id: 'p2', name: 'AssemblyAI', vendor: 'assemblyai', types: ['stt'], keyHint: '91c1', state: 'key_refused',
  stateDetail: 'invalid API key', usedBy: { defaults: ['stt'], agents: [] },
}
export const cloud: AiProviderSummary = {
  ...anthropic, id: 'p3', name: 'Agenthix Cloud', vendor: 'cloud', types: ['llm', 'stt', 'tts'], credential: 'none', keyHint: null,
  state: 'not_available', usedBy: { defaults: [], agents: [] },
}
export const custom: AiProviderSummary = { ...anthropic, id: 'p4', name: 'Our server', vendor: 'openai_compatible', baseUrl: 'https://models.example.org/v1', keyHint: 'zz11', usedBy: { defaults: [], agents: [] } }
export const openrouter: AiProviderSummary = { ...anthropic, id: 'p5', name: 'OpenRouter', vendor: 'openrouter', keyHint: '77aa', usedBy: { defaults: [], agents: [] } }
export const assemblyWorks: AiProviderSummary = { ...assembly, state: 'works', stateDetail: null }

export const settings = {
  orgName: 'Fernhill', choices: { current: null, recent: [], models: [] },
  conversation: { providerId: 'p1', model: 'claude-sonnet-5', text: 'Claude Sonnet 5 · via Anthropic', notWorking: false },
  stt: { providerId: 'p2', model: 'universal-3-6-pro', text: 'Universal-3 Pro · via AssemblyAI', notWorking: false },
  tts: null,
  stt_options: [{ providerId: 'p2', name: 'AssemblyAI', state: 'works', models: ['universal-3-6-pro', 'universal-streaming-english', 'universal-streaming-multilingual'] }],
  tts_options: [],
  list: { owner: 'organisation', ownerId: 'o', mode: 'every', entries: [], reachable: 41, allowedAbove: 41, allowed: 41 },
  reachable: [],
}
