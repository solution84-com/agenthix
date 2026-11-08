import { ClipboardList, Layers, Sparkles, Users } from 'lucide-react'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import type { LibraryKindId } from '../assetList/types'

// A kind's colour is one of the design tokens' state or accent colours, so it follows the theme.
const KIND: Record<Exclude<LibraryKindId, 'agent'>, { Icon: typeof Layers; tone: string }> = {
  skill: { Icon: Sparkles, tone: 'bg-accent/15 text-accent' },
  team: { Icon: Users, tone: 'bg-warning/15 text-warning' },
  'task-template': { Icon: ClipboardList, tone: 'bg-surface-2 text-text-secondary' },
}

/** The picture at the head of a card: an icon in its kind's colour, or an agent's own avatar. */
export function KindTile({ kind, name }: { kind: LibraryKindId; name: string }) {
  if (kind === 'agent') return <span data-testid="kind-tile-agent" className="shrink-0"><AuthedAgentAvatar name={name} size="lg" /></span>
  const { Icon, tone } = KIND[kind]
  return (
    <span aria-hidden data-testid={`kind-tile-${kind}`} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
      <Icon size={20} />
    </span>
  )
}
