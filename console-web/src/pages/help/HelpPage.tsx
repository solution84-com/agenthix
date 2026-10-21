import { useEffect, useId } from 'react'
import { ChevronLeft } from 'lucide-react'
import { CardLink, ListTitleRow, PageHeading } from '../../components'
import { Link, useSearchParam } from '../../router'
import { Markdown } from './renderMarkdown'
import { topicOf, topics, type Topic } from './topics'
import { helpHref, isTopicId } from './topicIds'

/**
 * Help (board *Proposal*, 9): the user guide's pages for running Agenthix, built into the Fleet Console from the files the
 * published guide is built from. The list is at `/help`; a topic is `/help?topic=<id>`, a section of it `&section=<heading id>`.
 */
export function HelpPage() {
  const topic = useSearchParam('topic')
  return isTopicId(topic) ? <TopicPage id={topic} /> : <TopicList />
}

function TopicCard({ topic }: { topic: Topic }) {
  const titleId = useId()
  return (
    <li>
      <CardLink to={helpHref(topic.id)} labelledBy={titleId} className="block h-full rounded-2xl border border-border-strong bg-card px-5 py-4">
        <h3 id={titleId} className="text-h3 font-semibold text-text-primary">{topic.title}</h3>
        <p className="mt-1 text-small text-text-secondary">{topic.description}</p>
      </CardLink>
    </li>
  )
}

function TopicList() {
  return (
    <>
      <ListTitleRow title="Help" lede="Running HQ and its sites, from the user guide — kept with this Fleet Console, so it works without the internet." />
      <ul aria-label="Help topics" className="grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-2">
        {topics().map(t => <TopicCard key={t.id} topic={t} />)}
      </ul>
    </>
  )
}

function TopicPage({ id }: { id: Parameters<typeof topicOf>[0] }) {
  const topic = topicOf(id)
  const section = useSearchParam('section')
  useEffect(() => {
    const target = section ? document.getElementById(section) : null
    if (target) target.scrollIntoView?.()
    else window.scrollTo?.(0, 0)
  }, [id, section])
  return (
    <>
      <Link to="/help" className="mb-3 inline-flex items-center gap-1 text-small font-medium text-text-secondary hover:text-text-primary">
        <ChevronLeft size={14} aria-hidden="true" />All help topics
      </Link>
      <PageHeading title={topic.title} lede={topic.description} />
      <Markdown blocks={topic.blocks} current={id} />
    </>
  )
}
