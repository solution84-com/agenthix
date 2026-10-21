/**
 * The guide's topics that Help opens, in the order Help lists them: each is the name of a page in
 * `docs/guide/running-agenthix/`, without `.md`. `HowThisWorks` and the guide's own links between pages use them.
 */
export const TOPIC_IDS = [
  'index',
  'new-fleet-admin',
  'hq-sites-and-fleet-admins',
  'backups-and-restoring',
  'back-up-and-upgrade',
  'add-a-site',
  'recover-admin',
  'domain-and-https',
  'commands',
] as const

export type TopicId = (typeof TOPIC_IDS)[number]

export const isTopicId = (id: string | null | undefined): id is TopicId => (TOPIC_IDS as readonly string[]).includes(id ?? '')

/** The address of a topic in Help, and of one of its sections (a heading's id). */
export const helpHref = (topic: TopicId, section?: string): string => `/help?topic=${topic}${section ? `&section=${encodeURIComponent(section)}` : ''}`
