import { parsePage, type Page } from './markdown'
import { isTopicId, TOPIC_IDS, type TopicId } from './topicIds'

// The guide's pages are read at build time, as text, from the same files the published guide is built from: no request is
// made to show them, and the screens carry the version of the guide they shipped with.
const SOURCES = import.meta.glob('../../../../docs/guide/running-agenthix/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const byName = new Map<string, string>(Object.entries(SOURCES).map(([path, source]) => [path.replace(/^.*\//, '').replace(/\.md$/, ''), source]))

export interface Topic extends Page { id: TopicId }

/** One topic, read. Throws if the build did not find its file: a missing page is a broken build, not an empty screen. */
export function topicOf(id: TopicId): Topic {
  const source = byName.get(id)
  if (source === undefined) throw new Error(`The guide page ${id}.md is missing.`)
  return { id, ...parsePage(source) }
}

export const topics = (): Topic[] => TOPIC_IDS.map(topicOf)

export { isTopicId }
