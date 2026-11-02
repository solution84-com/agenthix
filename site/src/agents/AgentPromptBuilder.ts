/**
 * AgentPromptBuilder
 * ==================
 * Single owner of all prompt assembly. Reads the person's agenda; instructions,
 * ORG.md and the place's AGENTS.md arrive as prompt content.
 *
 * Two named build methods, one per run mode:
 *   buildChatPrompt      — for ChatRunner
 *   buildTaskPrompt      — for TaskRunner
 *
 * Each returns { systemPrompt, userMessage } so the full picture of what
 * the agent sees is available to callers and the prompt preview.
 *
 * ADR-0032: Agent Execution Flow Convergence
 *
 * Severed from hq/src/agents/AgentPromptBuilder.ts (plan 5d-2 task 7b): `Agent`
 * (the `@prisma/client` model type) → `AgentConfigPayload` (core's dispatch
 * contract) — site has no Agent delegate at all (SC-338), so `AgentLike` is
 * typed against the shape hq actually hands the runtime at dispatch time
 * instead of the control-plane row. `../storage/paths` → `../server/storage/paths`
 * (paths.ts now lives under site/src/server/storage/, alongside the other
 * storage helpers ported in this same task).
 *
 * Split (plan 5b task 9, package prompt content): the agent identity/instructions
 * disk reads and the section-list methods moved out to promptSectionText.ts and
 * promptSectionLists.ts to keep this file under the repo's 500-line convention.
 * The constructor now takes the run's package content directly (PromptContent)
 * instead of reading disk itself for instructions/ORG.md.
 */
import { codeWorkPromptText, type RunCodeWork } from '@agenthix/core'
import fs from 'node:fs/promises'
import type { TaskCommentForRun } from '@agenthix/core'
import { PromptSection } from '../shared/promptSections'
import type { PromptContent } from './promptContent'
import { chatPreviewSections, taskPreviewSections } from './promptSectionLists'
import {
  type AgentLike,
  buildAgentIdentityContent,
  buildMemoryContent,
  buildOrgSection,
  buildAgendaSection,
  buildNoAgendaSection,
  buildLocalTimeSection,
  buildBoardSection,
  buildTaskSection,
  buildNewCommentsSection,
  buildTaskExecutionSection,
  buildPlaceInstructionsSection,
} from './promptSectionText'

// ─── File helpers ─────────────────────────────────────────────────────────────

async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

// ─── Base sections (Identity group) ──────────────────────────────────────────

function buildIdentitySection(agent: AgentLike, content: PromptContent, pinnedMemoryPath?: string | null): string[] {
  const sections = [buildAgentIdentityContent(agent)]
  if (content.instructions) sections.push(content.instructions)
  sections.push(buildMemoryContent(pinnedMemoryPath))
  return sections
}

/** The person a run is on behalf of, as far as the prompt needs: the zone their clock is in. */
export interface PersonClock { timezone: string }

function pushLocalTime(sections: string[], person: PersonClock | null | undefined, now: Date = new Date()): void {
  if (person?.timezone) sections.push(buildLocalTimeSection(person.timezone, now))
}

// ─── Container mounts type ───────────────────────────────────────────────────

/**
 * Container-side mount information passed by AgentEngine after prepareAgentContainer.
 * AgentPromptBuilder uses these to build the ## Filesystem section so agents
 * know where their directories are mounted and what their working directory is.
 *
 * Each entry is one location directory (files/ or workspaces/{id}) mounted at the
 * site's own id-keyed path with the site root removed (ADR-0074). Ids never change,
 * so a rename leaves every path — and every conversation filed under one — where
 * it was; the current names reach the agent as each entry's `description`.
 */
export interface ContainerMounts {
  /** All mounted location directories — containerDir is the bind destination inside the
   *  container. `description`, when set, is rendered after the path in the Filesystem
   *  section: what the folder is for, and its current name where it has one (a
   *  project's files, each workspace). Mounts without one stay bare. */
  locations: { containerDir: string; description?: string }[]
  /** The session's primary location containerDir (e.g. /projects/<project id>/workspaces/<workspace id>). */
  primaryContainerPath: string
  /**
   * Human-readable description of the primary location's role, shown after the cwd path.
   * Defaults to "this session's primary location" if not provided.
   * Task runs set this to "task working directory — create and edit task files here".
   */
  primaryPathDescription?: string
}

function buildFilesystemSection(mounts: ContainerMounts): string {
  const cwdDescription = mounts.primaryPathDescription ?? "this session's primary location. Create and edit work files here by default."
  const lines: string[] = [
    `- **Working directory (cwd):** \`${mounts.primaryContainerPath}\` — ${cwdDescription}`,
  ]
  for (const { containerDir, description } of mounts.locations) {
    lines.push(`- \`${containerDir}\`${description ? ` — ${description}` : ''}`)
  }
  return `## Filesystem\n\nPaths available in this run. Folders are named by id, which never changes; ` +
    `where a folder has a name, its current name is given beside it — use the name when talking to people.\n\n${lines.join('\n')}`
}

// ─── Prompt result type ───────────────────────────────────────────────────────

export interface PromptResult {
  systemPrompt: string
  userMessage:  string
}

// ─── AgentPromptBuilder ───────────────────────────────────────────────────────

function joinSections(sections: string[]): string {
  return sections.join('\n\n---\n\n')
}

export class AgentPromptBuilder {
  constructor(private agent: AgentLike, private content: PromptContent) {}

  async buildChatPrompt(context: {
    sessionContext?: string | null
    /** The agenda of the person in this conversation (close-out spec §6.1) —
     *  where this builder reads the file from, and the path the RUN sees, which
     *  is the one the prompt prints. Resolved by runLaunch (resolveRunAgenda),
     *  so the path named is always inside the run's own mounts. Absent when
     *  nobody invoked this run. */
    agenda?: { hostPath: string; visiblePath: string } | null
    containerMounts?: ContainerMounts
    person?: PersonClock | null
    /** The pinned memory file as the run sees it, when the run has one (`pinnedMemoryFiles.ts`). */
    pinnedMemoryPath?: string | null
    /** A run on a branch's copy: what it is told about its branch (core's `codeWorkPromptText`). */
    codeWork?: RunCodeWork | null
    now?: Date
  }): Promise<PromptResult> {
    const sections = buildIdentitySection(this.agent, this.content, context.pinnedMemoryPath)
    pushLocalTime(sections, context.person, context.now)

    // One section: the person's own file, then the guidance about it.
    sections.push(context.agenda
      ? buildAgendaSection(context.agenda.visiblePath, await readFile(context.agenda.hostPath))
      : buildNoAgendaSection())

    const place = buildPlaceInstructionsSection(this.content.place)
    if (place) sections.push(place)

    // Chat group
    if (context.sessionContext?.trim()) sections.push(context.sessionContext.trim())

    // Filesystem section — only present in container mode
    if (context.containerMounts) {
      sections.push(buildFilesystemSection(context.containerMounts))
    }
    if (context.codeWork) sections.push(codeWorkPromptText(context.codeWork))

    return {
      systemPrompt: joinSections(sections),
      userMessage: '',
    }
  }

  async buildTaskPrompt(context: {
    projectId: string
    boardName: string
    columns: string
    taskId: string
    title: string
    description: string
    roadmapPath: string
    /** The comments written since this agent's last run on the task, from the site's own runs. */
    newComments?: TaskCommentForRun[]
    containerMounts?: ContainerMounts
    /** The person the task is on behalf of, from the run's dispatch context. */
    person?: PersonClock | null
    pinnedMemoryPath?: string | null
    codeWork?: RunCodeWork | null
    now?: Date
  }): Promise<PromptResult> {
    const sections = buildIdentitySection(this.agent, this.content, context.pinnedMemoryPath)
    pushLocalTime(sections, context.person, context.now)

    // A task run acts for the project rather than for a person, so it has no
    // agenda — the user id on a task
    // session is bookkeeping, not the task's owner or its assignee.
    sections.push(buildNoAgendaSection())

    // Task group
    const org = buildOrgSection(this.content.org)
    if (org) sections.push(org)

    const place = buildPlaceInstructionsSection(this.content.place)
    if (place) sections.push(place)

    sections.push(buildBoardSection(context.boardName, context.columns))
    sections.push(buildTaskSection(context.taskId, context.title, context.description))
    if (context.newComments?.length) sections.push(buildNewCommentsSection(context.newComments))
    sections.push(buildTaskExecutionSection(context.roadmapPath))

    // Filesystem section — only present in container mode
    if (context.containerMounts) {
      sections.push(buildFilesystemSection(context.containerMounts))
    }
    if (context.codeWork) sections.push(codeWorkPromptText(context.codeWork))

    return {
      systemPrompt: joinSections(sections),
      userMessage: 'Execute your assigned task.',
    }
  }

  /** Preview only (no real run). */
  async buildChatSections(): Promise<PromptSection[]> {
    return chatPreviewSections(this.agent, this.content)
  }

  /** Preview only (no real run). */
  async buildTaskSections(): Promise<PromptSection[]> {
    return taskPreviewSections(this.agent, this.content)
  }
}
