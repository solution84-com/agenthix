import { useState } from 'react'
import { useQuery, getPins, getProjects } from 'wasp/client/operations'
import type { ConversationAgentView } from '../shared/conversations/protocol'
import { NewConversationBox } from '../conversations/components/NewConversationBox'
import { DockPlaceList } from './DockPlaceList'
import { useStartPlace, type PlaceRef, type StartPlace } from './startPlace'
import { groupPlaces, memberProjects, SPACE_ROW, type PinRow, type PlaceRow } from './placeList'

/**
 * The draft's area (spec §10): the list of places, the place the canvas is on already selected, a line saying who
 * leads the conversation and what it can use, and the message box, focused, so the usual case is to type and send.
 * Choosing a place hands it to a fresh `NewConversationBox`, keyed by the place so its own agent picker lists that
 * place's agents; it starts with `agentId` (*Talk to <agent>*) where that agent is one of them. Sending goes to the
 * new conversation's address, which the shell opens in the dock.
 */
export function DockNewConversation({ here: hereRef, agentId }: { here: PlaceRef; agentId: string | null }) {
  const [selected, setSelected] = useState<PlaceRef>(hereRef)
  const [agent, setAgent] = useState<ConversationAgentView | null>(null)
  const hereStart = useStartPlace(hereRef)
  const start = useStartPlace(selected)
  const { data: projectData } = useQuery(getProjects)
  const { data: pinData } = useQuery(getPins)
  const here = hereStart && placeRowOf(hereStart)
  const projects = memberProjects(projectData ?? [])
  const groups = here ? groupPlaces(here, projects, (pinData ?? []) as PinRow[]) : []

  return (
    <div data-testid="dock-new-conversation" className="flex min-h-0 flex-1 flex-col">
      {here && start
        ? <DockPlaceList groups={groups} here={here} selected={start.ref} onChoose={setSelected} />
        : <div className="min-h-0 flex-1" />}
      {start && (
        <>
          {agent && <LeadLine start={start} agent={agent} />}
          <NewConversationBox
            key={`${start.home}:${start.projectId ?? ''}`}
            home={start.home}
            projectId={start.projectId}
            basePath={start.basePath}
            placeholder={start.placeholder}
            noAgentsNotice={start.noAgentsNotice}
            agentId={agentId ?? undefined}
            onAgentChange={setAgent}
            autoFocus
          />
        </>
      )}
    </div>
  )
}

function placeRowOf(start: StartPlace): PlaceRow {
  return start.projectId ? { ref: start.ref, id: start.projectId, name: start.label } : SPACE_ROW
}

/** Who leads the conversation, the agent the box has picked, and what it can use (the board's line above the box). */
function LeadLine({ start, agent }: { start: StartPlace; agent: ConversationAgentView }) {
  const uses = start.home === 'PERSON' ? 'your own files' : `${start.label}'s files and tools`
  return (
    <p data-testid="dock-draft-lead" className="shrink-0 border-t border-border-subtle px-4 pt-2 text-small text-text-muted">
      <span className="font-medium text-text-primary">{agent.name}</span> leads it. It can use {uses}.
    </p>
  )
}
