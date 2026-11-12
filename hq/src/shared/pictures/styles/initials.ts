/**
 * Initials: the subject's letters on a palette colour. The recipe holds the colours, never the letters, so drawing it
 * again after a rename shows the new name's initials.
 */
import { avatarTextHex } from '../palette'
import { onlyKeys } from '../recipe'
import { BACKGROUND_KEYS, dicebearBackground, randomBackground, readBackground } from './background'
import type { PictureStyle } from './types'

function validate(choices: Record<string, unknown>): Promise<Record<string, unknown>> {
  onlyKeys(choices, BACKGROUND_KEYS, 'choices')
  return Promise.resolve({ ...readBackground(choices) })
}

export const initialsStyle: PictureStyle = {
  id: 'initials',
  kind: 'avatar',
  category: 'initials',
  label: 'Initials',
  version: 1,
  offeredTo: ['agent', 'person', 'team', 'org'],
  followsName: true,
  available: () => true,
  validate,

  async draw(raw, ctx) {
    const background = readBackground(await validate(raw))
    const [{ createAvatar }, initials] = await Promise.all([import('@dicebear/core'), import('@dicebear/initials')])
    const svg = createAvatar(initials, {
      seed: ctx.subject.name.trim() || '?',
      ...dicebearBackground(background),
      textColor: [avatarTextHex(background.background)],
      fontFamily: ['Helvetica'],
      fontWeight: 600,
      chars: 2,
    }).toString()
    return { type: 'svg', svg }
  },

  describe: () => Promise.resolve({ parts: [], colours: [], background: true, mirror: false }),

  random(rng) {
    return Promise.resolve({ ...randomBackground(rng) })
  },
}
