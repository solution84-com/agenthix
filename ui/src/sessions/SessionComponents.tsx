/**
 * SessionComponents
 * =================
 * The pieces every session view shares: the agent's avatar, a time as the conversation writes it, and the
 * transcript types callers import from here.
 */
import type { RenderMarkdown, LiveToolCall, TranscriptEntry } from './types'

export type { LiveToolCall, TranscriptEntry, RenderMarkdown }

export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function AgentAvatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const initials = name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  const dim = size === 'sm' ? 'w-6 h-6 text-micro' : size === 'lg' ? 'w-10 h-10 text-small' : 'w-8 h-8 text-micro'
  return (
    <div
      className={`relative flex items-center justify-center rounded-full font-medium text-on-accent flex-shrink-0 ${dim}`}
      style={{ background: `hsl(${hue} 60% 40% / 0.9)` }}
    >
      {initials || '?'}
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt=""
          className="absolute inset-0 w-full h-full rounded-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
    </div>
  )
}
