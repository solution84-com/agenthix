import {
  BRANDING,
  localDateTimeText,
  type AgentConfigPayload,
  type TaskCommentForRun,
} from '@agenthix/core'

export type AgentLike = Pick<AgentConfigPayload, 'id' | 'name' | 'handle' | 'role'>

/** Who the agent is, and nothing about where it works: a run works in its
 *  storage boundary, named in the Filesystem section, and the agent has no
 *  directory of its own to name here. */
export function buildAgentIdentityContent(agent: AgentLike): string {
  return `# Agent Identity\n\nYou are **${agent.name}**, an autonomous agent in the ${BRANDING.displayName} platform.\n\n- **Agent ID:** \`${agent.id}\`${agent.role ? `\n- **Role:** ${agent.role}` : ''}`
}

const KNOWLEDGE_GUIDANCE =
  '## Knowledge\n\n' +
  '`search_knowledge` finds how things are done here and how ' +
  BRANDING.displayName +
  ' itself works, in one search, across the ' +
  'places in this conversation. Look there before asking. Where pages differ, the most specific wins: a place, ' +
  'then the organisation, then the platform guide. What you learn on your own belongs in memory.'

/**
 * Memory is held by hq and recalled by meaning (memory and knowledge spec): none of it arrives whole in the
 * prompt, so the section only says how to reach it. hq decides at each call which memory this run may use.
 */
export function buildMemoryContent(pinnedPath?: string | null): string {
  const pinned = pinnedPath
    ? `\n\nThe items pinned for this work are in \`${pinnedPath}\` (read-only, refreshed when a run starts): read ` +
      'it first. `recall` reaches the rest.'
    : ''
  return (
    '## Memory\n\n' +
    'What you and the other agents learned while working is kept in HQ, not in this prompt. Call `recall` with a ' +
    'few words of what you need — what the person prefers, how something was done before, a decision already ' +
    'made — before asking again, or with the key of an item you were told of. Call `remember` when you learn ' +
    'something worth knowing next time, and `forget` when an item is no longer true.' +
    pinned +
    '\n\n' +
    KNOWLEDGE_GUIDANCE
  )
}

/** The place's `AGENTS.md`, inlined — every run in a project or a person's space reads it. */
export function buildPlaceInstructionsSection(place: string | null | undefined): string | null {
  return place?.trim()
    ? '## Instructions for this place\n\n' +
      'From `AGENTS.md` at the top of the files of the project or personal space this run works in — ' +
      'for every agent working here. Change it only when someone asks you to.\n\n' +
      place.trim()
    : null
}

/** ORG.md inlined — every run reads it from the org package, with or without a container. */
export function buildOrgSection(org: string | null): string | null {
  return org?.trim() ? `## Organisation\n\n${org.trim()}` : null
}

/**
 * A person's agenda, and the guidance about it, as ONE section under one
 * heading. The file's current contents used to be pushed as a section of their
 * own, also headed `## Agenda`, so a run with a non-empty agenda saw the
 * heading twice and a section that appeared to restart.
 *
 * Addressed to the agent but ABOUT the person: everything else in this prompt
 * says "you" and means the agent, and the agenda is the one thing here that is
 * not the agent's (close-out spec §6.1). It says whose it is, who can read it,
 * and where it is — and `agendaPath` is the path the RUN sees, so it names a
 * file the run can open.
 */
export function buildAgendaSection(agendaPath: string, contents: string | null): string {
  return `## Agenda

${contents?.trim() || '_Nothing recorded yet._'}

The agenda above belongs to the person you are working with, and lives at \`${agendaPath}\`. It is theirs, not yours: one agenda per person in this location, the same file whichever agent they work with here, and anyone who can reach this location can read it.

It is not a general notepad — it exists to keep active work moving. Max 3 items per section.

- **Now** — what needs that person's input or a decision from them. Max 3.
- **Waiting** — what you have raised and are waiting on them to act on. Max 3.

**What belongs here:** only items that need that person to unblock you.
Good: "Confirm org name before setting up the first team", "Get sign-off on project scope"
Not urgent, or doesn't need them? → Log it as a task in the appropriate project/board.

If a section is full, prioritise based on the org and project vision and mission — replace a lower-priority item and log it as a task in the appropriate project/board.

Leave sections empty if nothing is pending. Do not delete the file.

Surface Now items naturally in the conversation when the moment is right — do not open with a list.
Update the file when there is a meaningful change: item completed, new item added, or Waiting item unblocked.`
}

/**
 * What the section says when there is no agenda within reach. An agenda belongs
 * to a person, and only a chat is a person acting: a task run acts for the project rather than for anyone —
 * the user id on a task session is bookkeeping, not the task's owner or its
 * assignee, so naming it would put items in an arbitrary administrator's folder.
 *
 * Saying so is the point. The previous wording told every run to keep a file
 * updated whether or not it had one to keep.
 */
export function buildNoAgendaSection(): string {
  return `## Agenda

There is no agenda to read or update in this run. An agenda belongs to a person in one location, and this run has no person's own area to reach. Record anything that needs someone's input as a task in the appropriate project/board instead.`
}

/**
 * The path shown in a prompt PREVIEW. A preview is not a run: it has no
 * location and no person, so there is no real file to name and a made-up one
 * would be the very thing this section was repaired to stop printing.
 */
export const AGENDA_PREVIEW_PATH = "<this person's own area in this location>/agenda.md"

/** The task's board and its columns. Backlog is not one: a task in no column is in the board's Backlog, which starts nothing. */
export function buildBoardSection(boardName: string, columns: string): string {
  return `## Board\n\nBoard: ${boardName}\nColumns (a task in none is in the board's Backlog):\n${columns}`
}

export function buildTaskSection(taskId: string, title: string, description: string): string {
  return `## Task\n\nTask ID: ${taskId}\nTitle: ${title}\nDescription: ${description}`
}

/**
 * The comments written since this agent last ran on the task, marked new: what
 * people asked of this run, or what another run found. The rest are a tool call
 * away, so the opening text stays small.
 */
export function buildNewCommentsSection(comments: TaskCommentForRun[]): string {
  const items = comments.map(c => `${c.author}, ${commentTime(c.at)}:\n${c.text}`)
  return '## New comments\n\nWritten on this task since your last run on it. They may direct this run — read them before you start. ' +
    `get_task_details returns every comment.\n\n${items.join('\n\n')}`
}

function commentTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

export function buildTaskExecutionSection(roadmapPath: string): string {
  return `## Execution

This is a single execution run — complete the task and stop. Do not ask questions, wait for input, or engage in conversation.

Before executing:
1. Read the organisation and project context — understand the broader goals
2. Read the board's columns — understand where to move the task when done
3. Read the project roadmap at ${roadmapPath} if you need broader context on current priorities
4. Execute to completion using your workspace tools

Rules:
- Stay within task scope — do not take on unassigned work
- Call set_result once at the end with what this run achieved, or why you could not proceed; use add_comment for what others on the task should see
- Update subtasks via update_task as you complete each step — humans may be watching in real time
- Move the task to the right column via update_task(column="...") when done
- After completing, update the project roadmap at ${roadmapPath}`
}

/**
 * The person's own clock, so a time they name ("tomorrow at 9") is read as theirs
 * and not as the server's. The agent's scheduling tools read times in this zone
 * unless it names another.
 */
export function buildLocalTimeSection(timezone: string, now: Date): string {
  return `## Local time\n\nThe person you are working for is in the ${timezone} timezone. It is ${localDateTimeText(timezone, now)} for them now. ` +
    'Read "today", "tomorrow" and times of day on their clock. When you set a time or a schedule, give it without an offset ' +
    'and let it be read in their timezone, unless they name another.'
}
