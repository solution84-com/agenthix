/**
 * A model pick the page no longer offers is never kept. Settings are remembered for this browser, so a stored Talk to or
 * light model can name a model the organisation has since removed or that no longer works; hq refuses every turn on
 * it. Once the model choices have loaded, such a pick falls back (Talk to to the fake model; the light model to DeepSeek
 * Flash when offered, else hq's own choice) and the Settings tab says so in one line under the picker.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ModelChoices } from '../../../shared/conversations/protocol'
import type { PlaygroundLead } from '../../../shared/voicePlayground'
import { HQ_LISTENER_CHOICE } from '../../../shared/voicePlaygroundLight'
import { BASELINE_LIGHT_MODEL } from './lightModel'
import { DEFAULT_SETTINGS, type PlaygroundSettings } from './settings'

export const HQ_LISTENER_LABEL = "hq's choice for listening"
export const FAKE_LABEL = 'Fake model'

/** Whether the model picker offers it: a model the choices hold that works. */
export const isOffered = (choices: ModelChoices, value: string) => choices.models.some(m => m.value === value && !m.notWorking)

/** What replaces a Talk to that is not offered; null when it stays (the fake model, an offered model, or choices not loaded). */
export function staleLead(lead: PlaygroundLead, choices: ModelChoices | undefined): PlaygroundLead | null {
  if (!choices || lead.kind !== 'model' || isOffered(choices, lead.model)) return null
  return DEFAULT_SETTINGS.lead
}

/**
 * What replaces a light model that is not offered: `model` is what to keep (null: none chosen, which runs DeepSeek Flash)
 * and `label` what the note names. Null when it stays.
 */
export function staleListener(chosen: string | null, choices: ModelChoices | undefined): { model: string | null; label: string } | null {
  if (!choices || !chosen || chosen === HQ_LISTENER_CHOICE || isOffered(choices, chosen)) return null
  const flash = choices.models.find(m => m.value.endsWith(`/${BASELINE_LIGHT_MODEL}`) && !m.notWorking)
  return flash ? { model: null, label: flash.label } : { model: HQ_LISTENER_CHOICE, label: HQ_LISTENER_LABEL }
}

export type StaleNotes = { lead: string | null; light: string | null }

const said = (label: string) => `Your last pick isn't offered here any more, so this is ${label}.`

/** Replaces a pick that is not offered once the choices are in, and keeps the note for the page until the person picks again. */
export function useStalePicks(settings: PlaygroundSettings, choices: ModelChoices | undefined) {
  const [notes, setNotes] = useState<StaleNotes>({ lead: null, light: null })
  useEffect(() => {
    const { lead, listenerModel } = settings.get()
    const nextLead = staleLead(lead, choices)
    const nextLight = staleListener(listenerModel, choices)
    if (!nextLead && !nextLight) return
    settings.patch({ ...(nextLead && { lead: nextLead }), ...(nextLight && { listenerModel: nextLight.model }) })
    setNotes(n => ({ lead: nextLead ? said(FAKE_LABEL) : n.lead, light: nextLight ? said(nextLight.label) : n.light }))
  }, [settings, choices])
  const clear = useCallback((which: keyof StaleNotes) => setNotes(n => ({ ...n, [which]: null })), [])
  return { notes, clear }
}
