import type { ReactNode } from 'react'

/**
 * The conversation's header: one bar. The agent's avatar on the left, beside two short lines, its name and under it
 * the conversation's title (cut with … when long, the whole title as its tooltip); the places as stacked tiles and
 * the ⋯ menu on the right, centred on the bar. A hairline the panel's full width under it marks where the thread starts
 * (owner, 6 Nov: no line cut short inside the bar, but a clear edge). On a phone the title
 * is in the top bar, so the bar shows the name alone.
 */
export function ConversationHeader({ title, avatar, name, places, tools }: { title: string; avatar: ReactNode; name: ReactNode; places: ReactNode; tools: ReactNode }) {
  const shown = title || 'New conversation'
  return (
    <div className="w-full shrink-0 border-b border-border-subtle">
    <div
      className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-4 py-3 max-lg:py-2"
      data-testid="conversation-header"
    >
      <div className="shrink-0" data-testid="conversation-header-avatar">{avatar}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-small font-medium text-text-primary" data-testid="conversation-header-name">{name}</div>
        <h1 className="truncate text-small text-text-secondary max-lg:hidden" title={shown} data-testid="conversation-header-title">{shown}</h1>
      </div>
      <div className="flex shrink-0 items-center">{places}</div>
      <div className="flex shrink-0 items-center justify-end">{tools}</div>
    </div>
    </div>
  )
}
