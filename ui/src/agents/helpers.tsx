import { CheckCircle2, XCircle, Loader2, Ban } from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

// Resolved at runtime from GET /presets/{avatars,covers}
export function presetSrc(type: 'avatars' | 'covers', filename: string) {
  return `/presets/${type}/${filename}`
}

export function timeAgo(date: string | Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function truncate(text: string | null | undefined, n: number): string {
  if (!text) return '--'
  if (text.length <= n) return text
  return text.slice(0, n) + '...'
}

export function MarkdownLine({ line }: { line: string }) {
  if (line.startsWith('# ')) return <div className="text-body font-medium text-text-primary mt-4 first:mt-0">{line.slice(2)}</div>
  if (line.startsWith('## ')) return <div className="text-body font-medium text-text-primary mt-3">{line.slice(3)}</div>
  if (line.startsWith('### ')) return <div className="text-body font-semibold text-text-secondary mt-2">{line.slice(4)}</div>
  if (line.startsWith('- ')) return <div className="pl-4 text-text-secondary text-body before:content-['·'] before:mr-2 before:text-text-muted">{line.slice(2)}</div>
  if (line === '---') return <hr className="border-border my-4" />
  if (line === '') return <div className="h-1" />
  return <div className="text-text-secondary text-body">{line}</div>
}

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="font-mono leading-relaxed">
      {content.split('\n').map((l, i) => <MarkdownLine key={i} line={l} />)}
    </div>
  )
}

export function parseFrontmatter(content: string): { yaml: string | null; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { yaml: null, body: content }
  return { yaml: match[1], body: content.slice(match[0].length).trimStart() }
}


// ── Run status icon ──────────────────────────────────────────────────────────

export function RunStatusIcon({ status }: { status: string }) {
  if (status === 'COMPLETED') return <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
  if (status === 'FAILED') return <XCircle className="w-4 h-4 text-danger shrink-0" />
  if (status === 'RUNNING') return <Loader2 className="w-4 h-4 text-warning animate-spin shrink-0" />
  return <Ban className="w-4 h-4 text-text-muted shrink-0" />
}
