import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyText } from '../copyText'

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  const code = String(children ?? '').replace(/\n$/, '')

  const handleCopy = async () => {
    setCopied((await copyText(code)) ? 'yes' : 'failed')
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-3 border-b border-border">
        <span className="text-micro text-text-muted font-mono uppercase tracking-wide">
          {className?.replace('language-', '') || 'code'}
        </span>
        <button
          onClick={() => void handleCopy()}
          className="flex items-center gap-1.5 text-micro text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          {copied === 'yes' ? (
            <><Check className="w-3 h-3 text-success" /><span className="text-success">Copied</span></>
          ) : copied === 'failed' ? (
            <span className="text-danger">Could not copy: select the text</span>
          ) : (
            <><Copy className="w-3 h-3" /><span>Copy</span></>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-surface-2 text-body">
        <code className="font-mono text-text-primary">{code}</code>
      </pre>
    </div>
  )
}

interface MarkdownMessageProps {
  content: string
  className?: string
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div className={`prose-markdown ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // A fenced block arrives as <pre><code>; only that is a block. Judging by the language class instead
          // made a block with no language render inline, its lines run together.
          code: ({ children }) => (
            <code className="bg-surface-3 text-accent px-1.5 py-0.5 rounded text-[0.8em] font-mono">{children}</code>
          ),
          pre: ({ children }) => {
            const inner = isValidElement(children) ? (children as ReactElement<{ className?: string; children?: ReactNode }>).props : {}
            return <CodeBlock className={inner.className}>{inner.children}</CodeBlock>
          },
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 leading-relaxed text-text-primary">{children}</p>
          ),
          h1: ({ children }) => (
            <h1 className="text-h2 font-semibold text-text-primary mb-2 mt-4 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-h3 font-semibold text-text-primary mb-2 mt-3 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-body font-semibold text-text-primary mb-1.5 mt-3 first:mt-0">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 pl-5 space-y-1 list-disc marker:text-text-muted">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 pl-5 space-y-1 list-decimal marker:text-text-muted">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-text-primary leading-relaxed">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent pl-4 my-3 text-text-secondary italic">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-text-primary">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-text-secondary">{children}</em>
          ),
          hr: () => <hr className="border-border my-4" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover underline underline-offset-2"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-body border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-surface-3">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-text-secondary font-medium border border-border text-small">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-text-primary border border-border">{children}</td>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-border hover:bg-surface-2/50">{children}</tr>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
