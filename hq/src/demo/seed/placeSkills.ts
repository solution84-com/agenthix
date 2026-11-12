import { ASSET_MANIFEST_FILE, PLACE_SKILLS_ROOT, idFor, type SeedSkill } from '@agenthix/core'
import type { PackageFile } from '../../library/packages/packageZip'
import { withSkillMetadata } from '../../assets/places/metadata'
import { SKILL_FILE } from '../../assets/skillFile'
import type { PublishedSkill, SeedContext } from './types'

/** The version every seeded Library skill is published at. */
export const FIRST_VERSION = '1.0.0'

/** What *Add to this place* writes into a place's folder from a Library skill (`assets/places/addRemove.ts`). Pure. */
export function placeCopy(published: PublishedSkill): PackageFile[] {
  const files = published.files.filter(f => f.path !== ASSET_MANIFEST_FILE)
  return withSkillMetadata(files, { version: published.version, identity: published.identity })
}

/**
 * A Library skill added to the projects its data names, as *Add to this place* leaves it, and switched on there: hq's
 * record of the copy and its first version. The site writes the copy's files from `site.files`, so the two agree only
 * when that text is what hq would write: checked here, and start-up stops when it is not.
 */
export async function seedPlaceSkills(c: SeedContext, s: SeedSkill, published: PublishedSkill): Promise<void> {
  const files = placeCopy(published)
  const path = `${PLACE_SKILLS_ROOT}/${s.name}`
  const md = files.find(f => f.path === SKILL_FILE)
  const by = idFor(c.ids.people, s.madeBy, 'person')
  const at = c.at(s.at)
  for (const project of s.places) {
    const onSite = c.seed.site.files.find(f => f.project === project && f.path === `${path}/${SKILL_FILE}`)
    if (files.length !== 1 || !md || onSite?.content !== md.content.toString('utf-8')) {
      throw new Error(`The demo seed's copy of the skill ${s.name} in ${project} (site.files ${path}/${SKILL_FILE}) is not what hq writes there.`)
    }
    const digest = await c.deps.storeFiles(c.db, files)
    const skill = await c.db.placeSkill.create({
      data: {
        placeType: 'project', placeId: idFor(c.ids.projects, project, 'project'), path, group: 'PLACE', name: s.name, description: s.description,
        lastFingerprint: digest, lastSeenAt: at, switch: 'ON', switchFingerprint: digest, switchedById: by, switchedAt: at, createdAt: at,
      },
    })
    await c.db.placeSkillVersion.create({
      data: {
        placeSkillId: skill.id, number: 1, digest, note: `Added from ${published.identity} ${published.version}`, publishedById: by,
        originIdentity: published.identity, originVersion: published.version, createdAt: at,
      },
    })
  }
}
