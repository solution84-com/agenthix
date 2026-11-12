/**
 * The style registry (ADR-0187): every style a picture can be made in, and the only place a style is named. The
 * picker's gallery, validation, drawing and the defaults all read it. A new style is a new entry here.
 */
import type { PictureContext, PictureKind } from '../recipe'
import { coverPatternsStyle } from './cover'
import { dicebearStyle } from './dicebear'
import { initialsStyle } from './initials'
import { robotsStyle } from './robots'
import type { PictureStyle, StyleCategory } from './types'

const AGENTS_AND_PEOPLE = ['agent', 'person'] as const
const ORG = ['org'] as const

const faces: PictureStyle[] = [
  dicebearStyle({ id: 'notionists', label: 'Notionists', category: 'faces', offeredTo: AGENTS_AND_PEOPLE, load: () => import('@dicebear/notionists') }),
  dicebearStyle({ id: 'notionists-neutral', label: 'Notionists face only', category: 'faces', offeredTo: AGENTS_AND_PEOPLE, load: () => import('@dicebear/notionists-neutral') }),
  dicebearStyle({
    id: 'lorelei', label: 'Lorelei', category: 'faces', offeredTo: AGENTS_AND_PEOPLE, load: () => import('@dicebear/lorelei'),
    colours: { hairColor: 'hair', skinColor: 'skin' },
  }),
  dicebearStyle({ id: 'lorelei-neutral', label: 'Lorelei face only', category: 'faces', offeredTo: AGENTS_AND_PEOPLE, load: () => import('@dicebear/lorelei-neutral') }),
  dicebearStyle({
    id: 'open-peeps', label: 'Open Peeps', category: 'faces', offeredTo: AGENTS_AND_PEOPLE, load: () => import('@dicebear/open-peeps'),
    colours: { headContrastColor: 'hair', skinColor: 'skin', clothingColor: 'avatar' },
  }),
  dicebearStyle({
    id: 'thumbs', label: 'Thumbs', category: 'faces', offeredTo: AGENTS_AND_PEOPLE, load: () => import('@dicebear/thumbs'),
    colours: { shapeColor: 'avatar' },
  }),
  dicebearStyle({
    id: 'pixel-art', label: 'Pixel Art', category: 'faces', offeredTo: AGENTS_AND_PEOPLE, load: () => import('@dicebear/pixel-art'),
    colours: { hairColor: 'hair', skinColor: 'skin' },
  }),
  dicebearStyle({ id: 'pixel-art-neutral', label: 'Pixel Art face only', category: 'faces', offeredTo: AGENTS_AND_PEOPLE, load: () => import('@dicebear/pixel-art-neutral') }),
]

const symbols: PictureStyle[] = [
  dicebearStyle({ id: 'icons', label: 'Icons', category: 'symbols', offeredTo: ORG, mirror: false, midBackground: true, load: () => import('@dicebear/icons') }),
  dicebearStyle({
    id: 'shapes', label: 'Shapes', category: 'symbols', offeredTo: ORG, load: () => import('@dicebear/shapes'),
    colours: { shape1Color: 'avatar', shape2Color: 'avatar', shape3Color: 'avatar' },
  }),
  dicebearStyle({ id: 'glass', label: 'Glass', category: 'symbols', offeredTo: ORG, midBackground: true, load: () => import('@dicebear/glass') }),
  dicebearStyle({
    id: 'rings', label: 'Rings', category: 'symbols', offeredTo: ORG, load: () => import('@dicebear/rings'),
    colours: { ringColor: 'avatar' },
  }),
  dicebearStyle({
    id: 'identicon', label: 'Identicon', category: 'symbols', offeredTo: ORG, mirror: false, load: () => import('@dicebear/identicon'),
    colours: { rowColor: 'avatar' },
  }),
]

/** Every style, in the order the picker's gallery shows them. The cover generator joins as its own entry. */
export const PICTURE_STYLES: readonly PictureStyle[] = [robotsStyle, ...faces, ...symbols, initialsStyle, coverPatternsStyle]

export const CATEGORY_ORDER: readonly StyleCategory[] = ['robots', 'faces', 'symbols', 'initials', 'cover']

export function findStyle(id: string): PictureStyle | undefined {
  return PICTURE_STYLES.find((style) => style.id === id)
}

/** The styles this subject may use for this kind of picture, here and now (the robots only with their manifest). */
export function stylesFor(kind: PictureKind, ctx: PictureContext): PictureStyle[] {
  return PICTURE_STYLES.filter(
    (style) => style.kind === kind && style.offeredTo.includes(ctx.subject.kind) && style.available(ctx),
  )
}

export type { PictureStyle, PictureDrawing, PictureFill, StyleCategory } from './types'
