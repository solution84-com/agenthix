import type { ReactNode } from 'react'
import { Link } from '../../router'
import type { Block, Inline } from './markdown'
import { helpHref, isTopicId } from './topicIds'

/**
 * The guide's Markdown as React elements. Everything is built as elements with the text as children, never as HTML, so
 * nothing a page contains can run or load: a `<script>` in a page shows as the words it is. A link is followed only if
 * it is a page of the topics (opened inside Help) or an `https://` address (a new tab); any other shows as its text.
 */

/** Where a guide link goes inside Help, or null if it is not one of the topics. */
export function topicLink(href: string, current: string): string | null {
  const m = /^(?:([a-z0-9-]+)\.md)?(?:#(.*))?$/.exec(href)
  if (!m || (!m[1] && m[2] === undefined)) return null
  const topic = m[1] ?? current
  return isTopicId(topic) ? helpHref(topic, m[2] || undefined) : null
}

function Inlines({ nodes, current }: { nodes: Inline[]; current: string }) {
  return <>{nodes.map((n, k) => <InlineNode key={k} node={n} current={current} />)}</>
}

const LINK = 'font-medium text-accent underline underline-offset-2'

function InlineNode({ node, current }: { node: Inline; current: string }): ReactNode {
  switch (node.t) {
    case 'text': return node.text
    case 'code': return <code className="rounded bg-surface-hover px-1 py-px font-mono text-[0.92em] text-text-primary">{node.text}</code>
    case 'strong': return <strong className="font-semibold text-text-primary"><Inlines nodes={node.children} current={current} /></strong>
    case 'em': return <em><Inlines nodes={node.children} current={current} /></em>
    case 'link': {
      const inner = <Inlines nodes={node.children} current={current} />
      const to = topicLink(node.href, current)
      if (to) return <Link to={to} className={LINK}>{inner}</Link>
      if (/^https:\/\/[^\s]+$/.test(node.href)) return <a href={node.href} target="_blank" rel="noopener noreferrer" className={LINK}>{inner}</a>
      return inner
    }
  }
}

/** A flowchart's arrows as rows: each thing, and what it leads to. Only `a --> b` lines, with an optional `["label"]`. */
function diagramRows(text: string): { from: string; to: string[] }[] {
  const labels = new Map<string, string>()
  const edges: [string, string][] = []
  const node = (s: string) => {
    const m = /^\s*([\w-]+)(?:\[\s*"?([^"\]]*)"?\s*\])?\s*$/.exec(s)
    if (!m) return null
    if (m[2] !== undefined) labels.set(m[1], m[2])
    return m[1]
  }
  for (const line of text.split('\n')) {
    const parts = line.split('-->')
    if (parts.length !== 2) continue
    const a = node(parts[0])
    const b = node(parts[1])
    if (a && b) edges.push([a, b])
  }
  const name = (id: string) => labels.get(id) ?? id
  const rows = new Map<string, string[]>()
  for (const [a, b] of edges) rows.set(name(a), [...(rows.get(name(a)) ?? []), name(b)])
  return [...rows].map(([from, to]) => ({ from, to }))
}

function Diagram({ text }: { text: string }) {
  const rows = diagramRows(text)
  if (!rows.length) return null
  const chip = 'rounded-lg border border-border-strong bg-card px-2.5 py-1 text-small font-medium text-text-primary'
  return (
    <figure className="my-3 flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3" aria-label="Diagram">
      {rows.map(r => (
        <div key={r.from} className="flex flex-wrap items-center gap-2">
          <span className={chip}>{r.from}</span>
          <span aria-label="has" className="text-text-muted">→</span>
          {r.to.map(t => <span key={t} className={chip}>{t}</span>)}
        </div>
      ))}
    </figure>
  )
}

function Blocks({ blocks, current }: { blocks: Block[]; current: string }) {
  return <>{blocks.map((b, k) => <BlockNode key={k} block={b} current={current} />)}</>
}

function BlockNode({ block, current }: { block: Block; current: string }): ReactNode {
  switch (block.t) {
    case 'heading': {
      const cls = block.level === 2 ? 'mt-7 mb-2 text-h2 font-semibold text-text-primary' : 'mt-5 mb-1.5 text-h3 font-semibold text-text-primary'
      const inner = <Inlines nodes={block.children} current={current} />
      return block.level === 2 ? <h2 id={block.id} className={cls}>{inner}</h2> : <h3 id={block.id} className={cls}>{inner}</h3>
    }
    case 'para': return <p className="my-2 text-body leading-relaxed text-text-secondary"><Inlines nodes={block.children} current={current} /></p>
    case 'code':
      if (block.lang === 'mermaid') return <Diagram text={block.text} />
      return <pre className="my-3 overflow-x-auto rounded-xl border border-border bg-card px-3.5 py-3 font-mono text-small text-text-primary"><code>{block.text}</code></pre>
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag className={`my-2 flex flex-col gap-1.5 pl-6 text-body text-text-secondary ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, k) => <li key={k} className="pl-1"><Blocks blocks={item} current={current} /></li>)}
        </Tag>
      )
    }
    case 'table':
      return (
        <div className="my-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-left text-small">
            <thead>
              <tr>{block.head.map((h, k) => <th key={k} className="border-b border-border px-3 py-2 font-semibold text-text-muted"><Inlines nodes={h} current={current} /></th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>{row.map((c, k) => <td key={k} className="border-t border-border-subtle px-3 py-2 align-top text-text-secondary"><Inlines nodes={c} current={current} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    // A picture is never loaded: the Fleet Console's page loads images from its own origin only, and Help makes no
    // request elsewhere. A screenshot linked by its release address shows as its alt text, opening the picture in a new tab.
    case 'image': {
      const alt = block.alt.trim()
      if (!alt || !/^https:\/\/[^\s]+$/.test(block.src)) return null
      return (
        <p className="my-2 text-small text-text-muted">
          Picture: <a href={block.src} target="_blank" rel="noopener noreferrer" className={LINK}>{alt}</a>
        </p>
      )
    }
  }
}

export function Markdown({ blocks, current }: { blocks: Block[]; current: string }) {
  return <div className="max-w-3xl"><Blocks blocks={blocks} current={current} /></div>
}
