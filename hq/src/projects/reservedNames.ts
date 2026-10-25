/**
 * The names a project may not take (agent knowledge spec, part 3: *Levels are names*). A knowledge page's name starts
 * with its level — a project's slug, `org`, `platform` or `personal` — so a project whose slug were one of the last
 * three could never be named apart from that level. A project made without a slug (a person's own) is named by its
 * key in lower case, so `ORG` is kept from keys too; `PERSONAL` and `PLATFORM` are longer than a key can be.
 */
import { ORG_LEVEL, PERSONAL_LEVEL, PLATFORM_LEVEL } from '../knowledge/reach'

export const RESERVED_PROJECT_SLUGS: readonly string[] = [ORG_LEVEL, PLATFORM_LEVEL, PERSONAL_LEVEL]
export const RESERVED_PROJECT_KEYS: readonly string[] = [ORG_LEVEL.toUpperCase()]

/** Why a project can't have this slug, or null when it can. */
export function reservedSlugRefusal(slug: string): string | null {
  if (!RESERVED_PROJECT_SLUGS.includes(slug)) return null
  return `A project can't be called "${slug}": org, platform and personal name the organisation's knowledge, the ` +
    'platform guide and each person\'s own space. Choose a different name. Nothing was changed.'
}

export function reservedKeyRefusal(key: string): string {
  return `A project can't have the key ${key}: it would read as the organisation's knowledge. Choose a different key. Nothing was changed.`
}
