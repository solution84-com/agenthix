import { AgentAvatar } from '../sessions/SessionComponents'
import { RunAvatar } from '../tasks/RunAvatar'
import { TaskTypeMark } from '../tasks/TaskTypeMark'
import { PriorityDot } from '../tasks/TasksToolParts'
import { ProgressRing } from '../tasks/TaskMarks'
import { BoardMenu, type BoardMenuItem } from './CardMenu'
import type { ViewCardData } from './types'
import { CARD_CLICKABLE, FOCUS_RING } from '../primitives/controlStyles'

/** The card's one small muted line: the priority dot, the type's icon (on a board that spans types), and the key. */
export function CardKeyLine({ card, showType }: { card: ViewCardData; showType: boolean }) {
  return (
    <span className="flex items-center whitespace-nowrap text-micro leading-4 text-text-muted">
      <PriorityDot priority={card.priority} className="mr-2" />
      {showType && card.type && <span className="mr-1.5 inline-flex"><TaskTypeMark type={card.type} size={13} /></span>}
      <span className="font-mono">{card.key}</span>
    </span>
  )
}

/** The assignee's avatar, whose ring is the run (D18); the words are its tooltip. */
export function CardAssignee({ card }: { card: ViewCardData }) {
  if (!card.agent) return null
  return (
    <RunAvatar name={card.agent.name} state={card.executionState}>
      <AgentAvatar name={card.agent.name} avatarUrl={card.agent.avatarUrl} size="sm" />
    </RunAvatar>
  )
}

/**
 * A task on a board (board cards layout C): the key line, then the title across the full width, two lines at most. The
 * bottom row is there only when the task has an assignee: the avatar at the left and the ⋯ at the right, shown on hover
 * and keyboard focus; with no assignee the ⋯ sits over the card's top right corner. No type-and-column words and no
 * buttons on a card. An epic shows its progress, and never an agent's ring.
 */
export function ViewCard({ card, showType, onOpen, menu, lifted = false }: {
  card: ViewCardData
  showType: boolean
  onOpen: () => void
  menu: BoardMenuItem[]
  /** Drawn under the pointer while it is dragged. */
  lifted?: boolean
}) {
  const reveal = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
  const actions = !lifted && <BoardMenu heading={card.key} items={menu} label={`Actions for ${card.key}`} className={reveal} />
  return (
    <div
      data-testid="board-card"
      className={`group relative flex flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5 ${lifted ? 'rotate-2 border-text-primary shadow-pop' : `${CARD_CLICKABLE} focus-within:border-border-strong`}`}
    >
      <button
        type="button" onClick={onOpen} aria-label={`Open ${card.key}: ${card.title}`}
        className={`flex min-w-0 flex-col gap-1.5 rounded text-left ${FOCUS_RING}`}
      >
        <CardKeyLine card={card} showType={showType} />
        <span title={card.title} className="line-clamp-2 text-body leading-[19px] text-text-primary">{card.title}</span>
        {card.epicProgress && (
          <span className="flex items-center text-micro leading-4 text-text-secondary">
            <ProgressRing done={card.epicProgress.done} total={card.epicProgress.total} />
          </span>
        )}
      </button>
      {card.agent ? (
        <div className="flex min-h-[30px] items-center gap-1">
          <CardAssignee card={card} />
          {actions && <span className="ml-auto">{actions}</span>}
        </div>
      ) : actions && <span className="absolute right-1 top-1">{actions}</span>}
    </div>
  )
}
