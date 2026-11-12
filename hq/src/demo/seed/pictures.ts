/**
 * The sample organisation's pictures (generated avatars spec, *The demo's sample organisation*): the seed data names a
 * recipe for each agent, team, person and the organisation, and they are drawn through the picture service once the
 * rows are written, so the sample looks the same after every reset. Kernel keeps what hq gave it at start.
 *
 * Every recipe is checked against the style registry before the seed writes anything, and a refused one stops the
 * seed: the data is wrong. A picture that cannot be drawn is logged and left empty, as anywhere else.
 */
import type { DemoSeed, SeedPictureRecipe } from '@agenthix/core'
import { validateRecipe } from '../../shared/pictures/pictures'
import type { PictureKind, SubjectKind } from '../../shared/pictures/recipe'
import { saveRecipePicture } from '../../pictures/service'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('DemoSeed')

/** One picture to draw: whose (the organisation's id is filled in when drawn), which, and its checked recipe. */
export type SeedPictureJob = { kind: SubjectKind; id: string | null; key: string; picture: PictureKind; recipe: SeedPictureRecipe }

/**
 * The pictures the seed names, each checked for its subject; `robots` are the installed robots' names, or null. An
 * agent's robot is used where the robots are installed, its `avatarWithoutRobots` where they are not. Throws, naming
 * every refused recipe, when any is refused.
 */
export async function checkSeedPictures(seed: DemoSeed, robots: readonly string[] | null): Promise<SeedPictureJob[]> {
  const o = seed.organisation
  const hasRobots = (robots?.length ?? 0) > 0
  const jobs: (SeedPictureJob & { name: string })[] = [
    { kind: 'org', id: null, key: 'org', name: o.org.name, picture: 'avatar', recipe: o.org.avatar },
    { kind: 'org', id: null, key: 'org', name: o.org.name, picture: 'cover', recipe: o.org.cover },
    ...o.people.map(p => ({ kind: 'person' as const, id: p.id, key: p.key, name: p.displayName, picture: 'cover' as const, recipe: p.cover })),
    ...o.teams.flatMap(t => (['avatar', 'cover'] as const).map(picture => ({ kind: 'team' as const, id: t.id, key: t.key, name: t.name, picture, recipe: t[picture] }))),
    ...o.agents.flatMap(a => [
      { kind: 'agent' as const, id: a.id, key: a.key, name: a.name, picture: 'avatar' as const, recipe: hasRobots ? a.avatar : a.avatarWithoutRobots },
      { kind: 'agent' as const, id: a.id, key: a.key, name: a.name, picture: 'cover' as const, recipe: a.cover },
    ]),
  ]
  const refused: string[] = []
  for (const job of jobs) {
    const check = await validateRecipe(job.recipe, job.picture, { subject: { kind: job.kind, name: job.name }, robots })
    if (!check.ok) refused.push(`${job.kind} ${job.key} ${job.picture}: ${check.reason}`)
  }
  if (refused.length) throw new Error(`The demo seed names pictures hq cannot make:\n  ${refused.join('\n  ')}`)
  return jobs.map(({ name: _name, ...job }) => job)
}

/** Draws each checked picture onto its row; a picture that cannot be drawn is logged and left empty. Returns how many were drawn. */
export async function drawSeedPictures(jobs: readonly SeedPictureJob[], orgId: string): Promise<number> {
  let drawn = 0
  for (const job of jobs) {
    try {
      await saveRecipePicture({ kind: job.kind, id: job.id ?? orgId }, job.picture, job.recipe)
      drawn += 1
    } catch (err) {
      logger.error(`The sample's ${job.kind} ${job.key} has no ${job.picture}: it could not be drawn:`, err)
    }
  }
  return drawn
}
