/**
 * Whether a skill found in a place's files runs (spec part 4 *Defaults and switches*, D13, H3). An *On* switch holds
 * only for the fingerprint it was set on, so a changed skill falls back to the default; an *Off* switch holds whatever
 * the files become, since a change never makes a skill someone switched off run again. A place's default may only be
 * stricter than the organisation's (adr-0072), and *Never* means hq reads no skills from files at all.
 */
import type { FileSkillsDefault, PlaceSkillSwitch } from '@prisma/client'

export type PlaceSkillSwitchRow = {
  switch: PlaceSkillSwitch | null
  switchFingerprint: string | null
  lastFingerprint: string | null
}

const STRICTNESS: Record<FileSkillsDefault, number> = { ON: 0, OFF: 1, NEVER: 2 }

/** The default that applies in a place: the stricter of the place's and the organisation's. */
export function effectiveDefault(placeDefault: FileSkillsDefault | null, orgDefault: FileSkillsDefault): FileSkillsDefault {
  if (!placeDefault) return orgDefault
  return STRICTNESS[placeDefault] > STRICTNESS[orgDefault] ? placeDefault : orgDefault
}

/** Whether the switch still decides: an Off always, an On only for the files it was set on. */
export function switchHolds(placeSkill: PlaceSkillSwitchRow): boolean {
  if (placeSkill.switch === 'OFF') return true
  return placeSkill.switch === 'ON' && placeSkill.switchFingerprint !== null && placeSkill.switchFingerprint === placeSkill.lastFingerprint
}

export function switchState(
  placeSkill: PlaceSkillSwitchRow,
  placeDefault: FileSkillsDefault | null,
  orgDefault: FileSkillsDefault,
): 'on' | 'off' {
  const fallback = effectiveDefault(placeDefault, orgDefault)
  if (fallback === 'NEVER') return 'off'
  if (switchHolds(placeSkill)) return placeSkill.switch === 'ON' ? 'on' : 'off'
  return fallback === 'ON' ? 'on' : 'off'
}
