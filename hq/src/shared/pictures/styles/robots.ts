/**
 * The robots: a set of pictures, not a drawing. Their names come from the robots bundle's manifest, supplied at run
 * time (PictureContext.robots); with no manifest the style is unavailable everywhere. `kernel` is Kernel's alone:
 * offered to no other agent and never picked at random.
 */
import { PictureRecipeError, onlyKeys, type PictureContext } from '../recipe'
import { pickOne } from '../random'
import { BACKGROUND_KEYS, backgroundFill, randomBackground, readBackground, readFlip } from './background'
import type { PictureStyle } from './types'

export const KERNEL_ROBOT = 'kernel'

/** A robot's name as the manifest and a recipe hold it: also its file name, so nothing else is accepted. */
const ROBOT_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function hasRobots(ctx: PictureContext): boolean {
  return (ctx.robots ?? []).some((name) => name !== KERNEL_ROBOT && ROBOT_NAME.test(name))
}

/** The robots this subject may use, Kernel's own first for Kernel. */
export function robotsFor(ctx: PictureContext): string[] {
  const names = (ctx.robots ?? []).filter((name) => ROBOT_NAME.test(name))
  const others = names.filter((name) => name !== KERNEL_ROBOT)
  return ctx.subject.isKernel && names.includes(KERNEL_ROBOT) ? [KERNEL_ROBOT, ...others] : others
}

function validate(choices: Record<string, unknown>, ctx: PictureContext): Promise<Record<string, unknown>> {
  onlyKeys(choices, ['robot', ...BACKGROUND_KEYS, 'flip'], 'choices')
  if (!hasRobots(ctx)) throw new PictureRecipeError('the robots are not installed')
  const robot = choices.robot
  if (typeof robot !== 'string' || !robotsFor(ctx).includes(robot)) {
    throw new PictureRecipeError('robot is not one this subject may use')
  }
  return Promise.resolve({ robot, ...readBackground(choices), flip: readFlip(choices) })
}

export const robotsStyle: PictureStyle = {
  id: 'robots',
  kind: 'avatar',
  category: 'robots',
  label: 'Robots',
  version: 1,
  offeredTo: ['agent'],
  followsName: false,
  available: hasRobots,
  validate,

  async draw(raw, ctx) {
    const choices = await validate(raw, ctx)
    return {
      type: 'picture',
      set: 'robots',
      name: choices.robot as string,
      background: backgroundFill(readBackground(choices)),
      flip: choices.flip === true,
    }
  },

  describe: () => Promise.resolve({ parts: [], colours: [], background: true, mirror: true }),

  random(rng, ctx) {
    const robots = robotsFor(ctx).filter((name) => name !== KERNEL_ROBOT)
    return Promise.resolve({ robot: pickOne(rng, robots), ...randomBackground(rng), flip: false })
  },
}
