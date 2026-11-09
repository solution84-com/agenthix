import { HttpError } from 'wasp/server'
import { providerStore } from '../providers/store'
import { readSnapshot } from '../routing/snapshot'
import { viewChoice } from '../models-settings/choices'
import { getModelsSettings } from '../models-settings/settingsReads'
import type { ModelsSettingsView } from '../models-settings/types'
import { refreshMissingInBackground } from '../routing/inworldModelsRefresh'
import { currentDefaults, firstListedModels, proposeDefaults, withFlaggedTypes } from './setupDefaults'

/**
 * The three defaults on setup's last look: what is set, else what finishing will write. Setup writes them when it
 * finishes, so a change made here is saved at once and the rest stay proposals until then. For the first admin.
 */
export const getSetupDefaults = async (_args: void, context: { user?: { id: string } | null }): Promise<ModelsSettingsView> => {
  if (!context.user) throw new HttpError(401)
  const view = await getModelsSettings(undefined, context)
  const found = await currentDefaults()
  if (!found) return view
  const providers = await providerStore().list()
  refreshMissingInBackground()
  const next = proposeDefaults(await withFlaggedTypes(providers), found.current, await firstListedModels(providers))
  const snap = await readSnapshot({ purpose: 'conversation', place: { kind: 'organisation' } })
  return {
    ...view,
    conversation: viewChoice(next.conversation, snap),
    stt: viewChoice(next.stt, snap, true), tts: viewChoice(next.tts, snap, true),
  }
}
