import { describe, expect, it } from 'vitest'
import {
  KERNEL_FALLBACK_RECIPE,
  defaultAvatarRecipe,
  drawRecipe,
  randomRecipe,
  validateRecipe,
} from '../pictures'
import { MAX_RECIPE_JSON_BYTES, type PictureContext, type PictureSubject } from '../recipe'
import { PICTURE_STYLES, stylesFor } from '../styles'

const ROBOTS = ['planner-checklist', 'security', 'kernel']
const agent: PictureSubject = { kind: 'agent', name: 'Writer' }
const kernel: PictureSubject = { kind: 'agent', name: 'Kernel', isKernel: true }
const ctx = (subject: PictureSubject, robots: readonly string[] | null = ROBOTS): PictureContext => ({ subject, robots })

const subjectFor = (offeredTo: readonly string[]): PictureSubject =>
  offeredTo.includes('agent') ? agent : offeredTo.includes('org') ? { kind: 'org', name: 'Fernhill' } : { kind: 'person', name: 'Avery Chen' }

describe('validateRecipe', () => {
  it.each(PICTURE_STYLES.map((s) => [s.id, s] as const))('accepts a random recipe of %s, unchanged', async (_id, style) => {
    const c = ctx(subjectFor(style.offeredTo))
    for (const seed of [1, 'two', 3]) {
      const recipe = await randomRecipe(style.id, seed, c)
      const check = await validateRecipe(JSON.parse(JSON.stringify(recipe)), style.kind, c)
      expect(check).toEqual({ ok: true, recipe })
    }
  })

  it('gives the same recipe for the same seed, and another for another', async () => {
    const c = ctx(agent)
    expect(await randomRecipe('notionists', 'seed-1', c)).toEqual(await randomRecipe('notionists', 'seed-1', c))
    expect(await randomRecipe('notionists', 'seed-1', c)).not.toEqual(await randomRecipe('notionists', 'seed-2', c))
  })

  it('refuses an unknown style', async () => {
    const recipe = { ...(await randomRecipe('thumbs', 1, ctx(agent))), style: 'avataaars' }
    expect(await validateRecipe(recipe, 'avatar', ctx(agent))).toEqual({ ok: false, reason: 'unknown style' })
  })

  it('refuses an unknown part, an unknown part value, and an unknown field', async () => {
    const r = await randomRecipe('thumbs', 1, ctx(agent))
    const parts = r.choices.parts as Record<string, unknown>
    for (const choices of [
      { ...r.choices, parts: { ...parts, hat: 'variant1' } },
      { ...r.choices, parts: { ...parts, face: 'variant99' } },
      { ...r.choices, parts: { ...parts, face: null } },
      { ...r.choices, extra: 1 },
      { ...r.choices, numbers: { ...(r.choices.numbers as object), faceRotation: 999 } },
    ]) {
      expect((await validateRecipe({ ...r, choices }, 'avatar', ctx(agent))).ok).toBe(false)
    }
    expect((await validateRecipe({ ...r, colour: 'x' }, 'avatar', ctx(agent))).ok).toBe(false)
  })

  it('refuses a missing part', async () => {
    const r = await randomRecipe('thumbs', 1, ctx(agent))
    const { face: _face, ...parts } = r.choices.parts as Record<string, unknown>
    expect((await validateRecipe({ ...r, choices: { ...r.choices, parts } }, 'avatar', ctx(agent))).ok).toBe(false)
  })

  it('refuses a colour that is not a palette name', async () => {
    const r = await randomRecipe('thumbs', 1, ctx(agent))
    for (const choices of [
      { ...r.choices, background: 'ff0000' },
      { ...r.choices, background2: '#ff0000' },
      { ...r.choices, shapeColor: 'blonde' },
    ]) {
      expect((await validateRecipe({ ...r, choices }, 'avatar', ctx(agent))).ok).toBe(false)
    }
  })

  it('refuses an oversized recipe', async () => {
    const r = await randomRecipe('initials', 1, ctx(agent))
    const big = { ...r, choices: { ...r.choices, background2: 'x'.repeat(MAX_RECIPE_JSON_BYTES) } }
    expect(await validateRecipe(big, 'avatar', ctx(agent))).toEqual({ ok: false, reason: 'too large' })
  })

  it('refuses a recipe of the wrong kind, format or style version', async () => {
    const r = await randomRecipe('initials', 1, ctx(agent))
    expect((await validateRecipe(r, 'cover', ctx(agent))).ok).toBe(false)
    expect((await validateRecipe({ ...r, v: 2 }, 'avatar', ctx(agent))).ok).toBe(false)
    expect((await validateRecipe({ ...r, styleVersion: 2 }, 'avatar', ctx(agent))).ok).toBe(false)
    expect((await validateRecipe(null, 'avatar', ctx(agent))).ok).toBe(false)
    expect((await validateRecipe('initials', 'avatar', ctx(agent))).ok).toBe(false)
  })

  it('refuses the robots where there is no manifest', async () => {
    const r = await randomRecipe('robots', 1, ctx(agent))
    expect(await validateRecipe(r, 'avatar', ctx(agent, null))).toEqual({ ok: false, reason: 'style not offered to this subject' })
    expect((await validateRecipe(r, 'avatar', ctx(agent, []))).ok).toBe(false)
    expect(stylesFor('avatar', ctx(agent, null)).map((s) => s.id)).not.toContain('robots')
  })

  it('refuses a robot that is not in the manifest', async () => {
    const r = await randomRecipe('robots', 1, ctx(agent))
    const recipe = { ...r, choices: { ...r.choices, robot: 'coder-ide' } }
    expect((await validateRecipe(recipe, 'avatar', ctx(agent))).ok).toBe(false)
  })

  it('offers kernel to Kernel alone, and never picks it at random', async () => {
    const r = await randomRecipe('robots', 1, ctx(agent))
    const asKernel = { ...r, choices: { ...r.choices, robot: 'kernel' } }
    expect((await validateRecipe(asKernel, 'avatar', ctx(agent))).ok).toBe(false)
    expect((await validateRecipe(asKernel, 'avatar', ctx(kernel))).ok).toBe(true)
    for (let seed = 0; seed < 50; seed++) {
      expect((await randomRecipe('robots', seed, ctx(kernel))).choices.robot).not.toBe('kernel')
    }
  })

  it("refuses a style the subject's category table does not offer it", async () => {
    const symbol = await randomRecipe('icons', 1, ctx({ kind: 'org', name: 'Fernhill' }))
    expect((await validateRecipe(symbol, 'avatar', ctx(agent))).ok).toBe(false)
    const face = await randomRecipe('lorelei', 1, ctx(agent))
    expect((await validateRecipe(face, 'avatar', ctx({ kind: 'team', name: 'Design' }))).ok).toBe(false)
    const robot = await randomRecipe('robots', 1, ctx(agent))
    expect((await validateRecipe(robot, 'avatar', ctx({ kind: 'person', name: 'Avery' }))).ok).toBe(false)
  })
})

describe('the styles each subject is offered', () => {
  const ids = (subject: PictureSubject, robots: readonly string[] | null = ROBOTS) =>
    stylesFor('avatar', ctx(subject, robots)).map((s) => s.category)
  it('follows the category table', () => {
    expect(new Set(ids(agent))).toEqual(new Set(['robots', 'faces', 'initials']))
    expect(new Set(ids({ kind: 'person', name: 'A' }))).toEqual(new Set(['faces', 'initials']))
    expect(new Set(ids({ kind: 'team', name: 'A' }))).toEqual(new Set(['initials']))
    expect(new Set(ids({ kind: 'org', name: 'A' }))).toEqual(new Set(['symbols', 'initials']))
  })
})

describe('defaultAvatarRecipe', () => {
  it('gives an agent a robot, or Thumbs without the robots', async () => {
    expect((await defaultAvatarRecipe(ctx(agent), 1))?.style).toBe('robots')
    expect((await defaultAvatarRecipe(ctx(agent, null), 1))?.style).toBe('thumbs')
  })

  it('gives Kernel its own robot, or its fixed Thumbs look, both valid', async () => {
    const own = await defaultAvatarRecipe(ctx(kernel), 1)
    expect(own?.choices.robot).toBe('kernel')
    expect((await validateRecipe(own, 'avatar', ctx(kernel))).ok).toBe(true)
    expect(await defaultAvatarRecipe(ctx(kernel, null), 1)).toBe(KERNEL_FALLBACK_RECIPE)
    expect(await validateRecipe(KERNEL_FALLBACK_RECIPE, 'avatar', ctx(kernel, null))).toEqual({ ok: true, recipe: KERNEL_FALLBACK_RECIPE })
  })

  it('leaves a person with initials, gives a team Initials and the organisation a symbol', async () => {
    expect(await defaultAvatarRecipe(ctx({ kind: 'person', name: 'A' }), 1)).toBeNull()
    expect((await defaultAvatarRecipe(ctx({ kind: 'team', name: 'A' }), 1))?.style).toBe('initials')
    expect((await defaultAvatarRecipe(ctx({ kind: 'org', name: 'A' }), 1))?.style).toBe('icons')
  })
})

describe('drawRecipe', () => {
  it('draws Initials from the current name, so a rename shows new letters', async () => {
    const team = (name: string) => ctx({ kind: 'team', name })
    const recipe = await randomRecipe('initials', 1, team('Design team'))
    const before = await drawRecipe(recipe, 'avatar', team('Design team'))
    const after = await drawRecipe(recipe, 'avatar', team('Research'))
    expect(before.type === 'svg' && before.svg).toContain('>DT<')
    expect(after.type === 'svg' && after.svg).toContain('>RE<')
  })

  it('draws a face the same whatever the name', async () => {
    const recipe = await randomRecipe('notionists', 1, ctx(agent))
    const a = await drawRecipe(recipe, 'avatar', ctx(agent))
    const b = await drawRecipe(recipe, 'avatar', ctx({ kind: 'agent', name: 'Renamed' }))
    expect(a).toEqual(b)
  })

  it('names the robot and its background for the server to place', async () => {
    const recipe = await randomRecipe('robots', 1, ctx(agent))
    const drawing = await drawRecipe(recipe, 'avatar', ctx(agent))
    expect(drawing).toMatchObject({ type: 'picture', set: 'robots', name: recipe.choices.robot })
  })

  it('refuses to draw a recipe validation refuses', async () => {
    await expect(drawRecipe({ v: 1, kind: 'avatar', style: 'nope', styleVersion: 1, choices: {} }, 'avatar', ctx(agent))).rejects.toThrow('unknown style')
  })
})
