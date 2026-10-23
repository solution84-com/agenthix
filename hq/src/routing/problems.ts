/**
 * The resolver's one problem, in words a person can act on: what is missing and who adds it (models from one place,
 * part 4). Organisation admins manage providers, defaults and lists; a person may pick another model themselves.
 */
import {
  AI_PROVIDER_VENDOR_INFO, type ResolveProblem, type ResolveProblemCode, type UsagePurpose,
} from '@agenthix/core'
import type { RouteProvider } from './decide'

const STATE_WORDS: Record<string, string> = {
  key_refused: 'refused its key', out_of_credit: 'says its account is out of credit', unreachable: 'could not be reached',
  not_available: 'is not available yet', disconnected: 'is disconnected', works: 'failed',
}

const KIND: Record<string, string> = { stt: 'speech to text', tts: 'text to speech' }

export function problemFor(
  code: ResolveProblemCode,
  about: { purpose: UsagePurpose; provider?: RouteProvider; agentName: string | null },
): ResolveProblem {
  const p = about.provider
  const name = p?.name ?? 'The provider'
  const kind = KIND[about.purpose] ?? 'model'
  const who = about.agentName ?? 'this agent'
  const base = { code, ...(p ? { providerId: p.id } : {}) }
  switch (code) {
    case 'no_provider':
      return { ...base, fixedBy: ['organisation_admin'], message: `No ${kind} provider is working. An organisation admin can add one, or fix the one there is, under Manage organisation › Providers.` }
    case 'provider_not_working':
      return {
        ...base, fixedBy: ['organisation_admin', 'person'],
        message: `${name} isn't working: ${AI_PROVIDER_VENDOR_INFO[p?.vendor ?? 'anthropic'].label} ${STATE_WORDS[p?.state ?? 'works']}. An organisation admin has been told.`,
      }
    case 'no_allowed_model':
      return { ...base, fixedBy: ['organisation_admin'], message: `No model ${who} may use is reached by the organisation's providers. An organisation admin can widen a list, or add a provider.` }
    case 'model_not_allowed':
      return { ...base, fixedBy: ['person', 'organisation_admin'], message: 'That model is not one the lists here allow. Choose another, or ask an organisation admin to widen a list.' }
    case 'model_not_reached':
      return { ...base, fixedBy: ['person', 'organisation_admin'], message: `${p ? `${name} no longer reaches that model` : 'The provider of that model is gone'}. Choose another model.` }
    case 'no_default':
      return { ...base, fixedBy: ['organisation_admin'], message: `No ${kind} is chosen for ${who}, and none is reached to fall back on. An organisation admin can choose the defaults under Manage organisation › Models.` }
    case 'subscription_outside_own_place':
      return { ...base, fixedBy: ['person'], message: 'Your own Claude subscription is used only for work in your own place: your space and your personal projects. Choose a model via one of the organisation\'s providers.' }
    case 'cap_reached':
      return { ...base, fixedBy: ['organisation_admin'], message: "Agenthix Cloud's spending limit is reached. An organisation admin can raise it at Agenthix Cloud." }
  }
}
