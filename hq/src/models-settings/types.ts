/** What the models settings reads return and the list editor shows (models from one place, part 4). */
import type { AiProviderState, ModelChoices, ModelListEffect, ModelListMode, ModelListOwner, ModelViaProvider } from '@agenthix/core'

/** A model the providers reach, once, whoever serves it: what a list's entries are counted against. */
export type ReachableModel = {
  /** The maker and name (`anthropic/claude-sonnet-5`), what lists match. */
  key: string
  label: string
  maker: string
  /** The providers that reach it, by name. */
  via: string[]
  price: 1 | 2 | 3
}

export type ListEntryView = {
  effect: ModelListEffect
  pattern: string
  /** How many of the reachable models the entry covers. */
  covers: number
  kind: 'model' | 'maker' | 'family' | 'everything'
  /** What the pattern means in words: *Every model made by xAI*. */
  meaning: string
}

export type ListView = {
  owner: ModelListOwner
  ownerId: string
  mode: ModelListMode
  entries: ListEntryView[]
  reachable: number
  /** Allowed by the lists above this one (the organisation's, for every list but its own). */
  allowedAbove: number
  /** Allowed by the lists above and this one. */
  allowed: number
}

/** A choice with the words to show it. */
export type ChoiceView = (ModelViaProvider & { voice?: string }) & { text: string; notWorking: boolean }

export type VoiceProviderOption = {
  providerId: string
  name: string
  state: AiProviderState
  models: string[]
}

export type ModelsSettingsView = {
  orgName: string
  /** The one default model: conversations start on it, and their work takes the conversation's model. */
  conversation: ChoiceView | null
  stt: ChoiceView | null
  tts: ChoiceView | null
  choices: ModelChoices
  stt_options: VoiceProviderOption[]
  tts_options: VoiceProviderOption[]
  list: ListView
  reachable: ReachableModel[]
}

export type AgentModelsView = {
  orgName: string
  /** The agent's own choices; null follows the organisation's. */
  conversation: ChoiceView | null
  stt: ChoiceView | null
  tts: ChoiceView | null
  /** The organisation's, to show beside "follow the organisation". */
  orgConversation: ChoiceView | null
  orgStt: ChoiceView | null
  orgTts: ChoiceView | null
  choices: ModelChoices
  stt_options: VoiceProviderOption[]
  tts_options: VoiceProviderOption[]
  list: ListView
  reachable: ReachableModel[]
}

/** A model choice sent from a form: a picker value (`<providerId>/<model>`). Null follows the layer above. */
export type ModelInput = string | null

/** A voice choice sent from a form. Null follows the layer above. */
export type VoiceInput = { providerId: string; model: string; voice?: string } | null
