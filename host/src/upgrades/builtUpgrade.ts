/**
 * A development build's upgrade of HQ (with its site) or of the site to images built on this machine under one tag
 * (`hq upgrade --image-tag <tag>`), so the whole upgrade — backup, stop, the new projects, start, health check and the
 * put-back — runs against real containers on a dev machine. Like the host service's own switch to a build
 * (`builtHostService.ts`), it skips what only a published version has, the signature and "only forward", and is
 * otherwise the published upgrade (`upgrade.ts`). A published host service never takes this path, and each image is
 * one of this machine's: `<image name>:<tag>`, never a published image's name.
 *
 * With no version to tell old from new, what was started is told by its image: the health check counts hq-server
 * and the site only when their containers run the images found here (`health.ts`).
 */
import { imageName } from '@agenthix/core'
import type { Context } from '../service/context'
import { installed } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import type { ImagePins } from '../images/images'
import { fromTrustedPublisher, isPublishedVersion, type PublishedPart } from '../images/published'
import type { Target } from './rules'

const NOTHING = 'Nothing was changed.'

/** A tag as Docker writes one. */
export const IMAGE_TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/

/** What a built upgrade goes to: the tag, and each image's id as Docker holds it now. */
export type BuiltImages = { tag: string; ids: Partial<Record<PublishedPart, string>> }

/** `the images tagged <tag>`, for the sentences an upgrade says. */
export const builtText = (tag: string) => `the images tagged ${tag}`

/** The command that runs this upgrade again, which finishes or puts back one under way. */
export const againCommand = (target: Target, to: string, built: string | null | undefined) =>
  cmd(built ? `${target} upgrade --image-tag ${built}` : `${target} upgrade ${to}`)

/** Refuses a built upgrade this host service cannot take, before anything is looked at. */
export function checkBuiltUpgrade(ctx: Context, target: Target, tag: string): void {
  const host = ctx.machine.hostServiceVersion
  if (isPublishedVersion(host)) {
    throw new Refusal('conflict', `This host service is ${host}, a published version: it upgrades only to published versions, checked against their signatures, never to images built on this machine. ${NOTHING}`)
  }
  if (!IMAGE_TAG.test(tag)) throw new Refusal('malformed', `${tag} is not an image tag. ${NOTHING}`)
  if (!installed(ctx)[target]) {
    throw new Refusal('not_installed', target === 'hq'
      ? `No HQ here: ${ctx.machine.name} runs no HQ. ${NOTHING}`
      : `No site runs on ${ctx.machine.name}. To install HQ and its site here: ${cmd('install')}`)
  }
}

/**
 * Each part's image built here under `tag`, by its name (`<image name>:<tag>`) and its id. Refused, naming the first
 * missing one, when any is not on this machine.
 */
export async function builtPins(ctx: Context, parts: readonly PublishedPart[], tag: string): Promise<{ pins: ImagePins; built: BuiltImages }> {
  const pins: ImagePins = {}
  const ids: BuiltImages['ids'] = {}
  for (const part of parts) {
    const ref = `${imageName(part)}:${tag}`
    // A bare image name is never a published one; checked all the same, since the rule is the point.
    if (fromTrustedPublisher(ref)) throw new Refusal('conflict', `${ref} names a published image. ${NOTHING}`)
    const image = await ctx.containers.image(ref)
    if (!image) throw new Refusal('failed', `The image ${ref} is not on this machine. Build it, or tag one, as ${ref}, then run this again. ${NOTHING}`)
    pins[part] = ref
    ids[part] = image.id
  }
  return { pins, built: { tag, ids } }
}
