import type { AiProviderVendor } from '@agenthix/core'

/**
 * What the key form's short guide says for a vendor: where its key page is, where to sign in, and any line that
 * differs from the three common steps. Every vendor's page address and wording is here, nowhere in a component.
 * The user guide's "Get an API key" page carries the fuller steps.
 */
export type KeyGuide = {
  /** The vendor's key page, opened in a new tab. */
  pageUrl: string
  /** Where step 1 sends the person: "Anthropic's console". */
  signInAt: string
  /** Replaces the common "add credit" step when the vendor's billing needs a word more. */
  creditStep?: string
  /** Replaces the common "create a key" step. */
  keyStep?: string
  /** One extra line under the steps: the trap a new person is likeliest to hit. */
  note?: string
}

/** A vendor with no entry has no guide: its own endpoint, whose key depends on the server, and Agenthix Cloud. */
export const KEY_GUIDES: Partial<Record<AiProviderVendor, KeyGuide>> = {
  anthropic: {
    pageUrl: 'https://platform.claude.com/settings/keys',
    signInAt: "Anthropic's console",
    creditStep: 'Add credit to the account if it asks. An API key is billed to the account, separately from a Claude chat plan.',
    note: 'A Claude Pro or Max plan is not an API key. If that is what you have, each person can sign in with it later instead.',
  },
  // The address is the one third-party guides give; it could not be loaded when it was written. A person confirms it once.
  openai: { pageUrl: 'https://platform.openai.com/api-keys', signInAt: "OpenAI's platform" },
  google: { pageUrl: 'https://aistudio.google.com/apikey', signInAt: 'Google AI Studio' },
  openrouter: { pageUrl: 'https://openrouter.ai/settings/keys', signInAt: 'OpenRouter' },
  inworld: {
    pageUrl: 'https://platform.inworld.ai/api-keys',
    signInAt: "Inworld's portal",
    keyStep: 'On the key’s page, copy the value labelled Basic (Base64) and paste it below.',
  },
  assemblyai: { pageUrl: 'https://www.assemblyai.com/dashboard/api-keys', signInAt: 'AssemblyAI' },
}

export const COMMON_CREDIT_STEP = 'Add credit to the account if it asks.'
export const COMMON_KEY_STEP = 'Create a key, copy it (it is shown once) and paste it below.'
