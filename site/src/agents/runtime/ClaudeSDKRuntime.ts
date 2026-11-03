import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Logger } from '../../server/utils/logger'
import { clearConversationTurn, pointConversationToken } from '../../server/runtime/conversationTokens'
import type { AgentRuntime, ConversationRef, RunContext, RunEvent, SessionExistenceQuery } from './types'
import { claudeSessionFileExists } from './claudeSessionFile'
import { ClaudeProcess } from './claude/claudeProcess'
import { claudeProcessFor, closeClaudeProcess, keepClaudeProcess } from './claude/claudeProcesses'
import { harnessMemoryCeilingMb } from './claude/claudeProcessProbe'
import { removeStagedSkills, stageTurnSkills, type StagedTurnSkills } from './claude/claudeSkills'
import { buildClaudeStart, type ClaudeStart } from './claude/claudeStart'
import { requireLandlock } from './landlockCheck'
import { PLATFORM_TOKEN_ENV } from './agentImage'
import { turnPrompt } from './pickedSkill'

const logger = new Logger('ClaudeSDKRuntime')

function isSessionInUseError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.toLowerCase().includes('already in use')
}

/**
 * Claude Code, one `claude` process per conversation (spec §1, adr-0081): the
 * process stays alive across the conversation's turns, each turn one more
 * message on its streaming input, and is ended when the conversation goes
 * idle or ends.
 */
export class ClaudeSDKRuntime implements AgentRuntime {
  async sessionExists(query: SessionExistenceQuery): Promise<boolean> {
    if (process.env.AGENT_CONTAINER_ISOLATION === 'true') {
      return claudeSessionFileExists(query.harnessHomeDir, query.workingDirectory, query.sessionId)
    }
    // Without a container, Claude Code runs as a child of this process with
    // this process's environment, so it keeps its sessions in this process's
    // own Claude config dir — not in the runner's home — and files them under
    // the real path of its working directory, which is on this machine.
    const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')
    const cwd = await fs.realpath(query.workingDirectory).catch(() => query.workingDirectory)
    return claudeSessionFileExists(configDir, cwd, query.sessionId)
  }

  async conversationIdle(conversation: ConversationRef): Promise<void> {
    await closeClaudeProcess(conversation.sessionId)
  }

  async endConversation(conversation: ConversationRef): Promise<void> {
    await closeClaudeProcess(conversation.sessionId)
  }

  async *run(context: RunContext): AsyncIterable<RunEvent> {
    const sdkSessionId = context.sessionId
    let skills: StagedTurnSkills | null = null
    try {
      skills = await stageTurnSkills(context)
      // The process this turn goes to has these skills: a running one is kept only when its skills are the same.
      const turn = withConversationToken(context)
      const start = buildClaudeStart(turn, skills)
      logLaunch(turn, sdkSessionId, skills)
      const { process: claude, adoptedSkills } = await this.processFor(turn, start, skills, sdkSessionId)
      if (adoptedSkills) skills = null
      yield* this.runTurn(claude, turn, start, sdkSessionId)
    } finally {
      if (skills) await removeStagedSkills(skills.serverDir)
      clearConversationTurn(context.sessionId, context.runId)
    }
  }

  /**
   * The conversation's process for this turn: the running one when it can
   * take the turn as it is, otherwise a new one, which resumes the
   * conversation. The turn's staged skills are adopted by a new process, and
   * left for the caller to remove when the running one is kept.
   */
  private async processFor(
    context: RunContext,
    start: ClaudeStart,
    skills: StagedTurnSkills | null,
    sdkSessionId: string,
  ): Promise<{ process: ClaudeProcess; adoptedSkills: boolean }> {
    const running = claudeProcessFor(context.sessionId)
    if (running) {
      const reason = replacementReason(running, start)
      if (!reason && await running.setModel(context.model)) return { process: running, adoptedSkills: false }
      logger.info(`[process] conversation=${context.sessionId} replaced: ${reason ?? 'it refused the model'}`)
      await closeClaudeProcess(context.sessionId)
    }
    // No agent command runs where Landlock cannot contain it (spec, "Keeping the gate whole" item 3).
    if (context.containerName) await requireLandlock(context.containerName)
    const session = context.isNewSession ? { sessionId: sdkSessionId } : { resume: sdkSessionId }
    return { process: startProcess(context, start, skills, session), adoptedSkills: true }
  }

  private async *runTurn(claude: ClaudeProcess, context: RunContext, start: ClaudeStart, sdkSessionId: string): AsyncIterable<RunEvent> {
    try {
      yield* claude.turn(withTurnPrompt(context, claude), sdkSessionId)
      return
    } catch (err) {
      if (context.abortSignal?.aborted) return
      await closeClaudeProcess(context.sessionId)
      if (!shouldRetry(claude, err)) {
        if (claude.stderrText.trim()) logger.error(`[stderr dump] run=${context.runId}:\n${claude.stderrText.trim()}`)
        throw err
      }
    }
    logger.warn(`[session] run ${context.runId}: the process could not take the turn — retrying in a new one, resuming`)
    // The failed process took the skills folder with it; the retry stages its own.
    const skills = await stageTurnSkills(context)
    const retry = startProcess(context, skills ? buildClaudeStart(context, skills) : start, skills, { resume: sdkSessionId })
    try {
      yield* retry.turn(withTurnPrompt(context, retry), sdkSessionId)
    } catch (err) {
      if (context.abortSignal?.aborted) return
      await closeClaudeProcess(context.sessionId)
      throw err
    }
  }
}

/**
 * Whether a turn that failed before it began is retried in a new process that
 * resumes the conversation. Two cases, and only these:
 *
 * - Claude Code refuses `--session-id` for an id whose transcript file already
 *   exists. That happens when our record counts a conversation as new (no
 *   assistant reply stored yet) but an earlier turn got far enough for the
 *   harness to write its file — a turn that failed or was stopped before it
 *   replied. It is not a concurrency error, so the conversation is resumed.
 * - A process that served earlier turns ended between turns — killed with the
 *   conversation's other processes, say — and the turn got nothing back.
 *
 * Never the other way round: a failed resume is not answered with a fresh
 * session under the same id (adr-0076).
 */
function shouldRetry(claude: ClaudeProcess, err: unknown): boolean {
  if (claude.servedTurn) return !claude.turnAnswered
  return isSessionInUseError(err) || isSessionInUseError(claude.stderrText)
}

function startProcess(
  context: RunContext,
  start: ClaudeStart,
  skills: StagedTurnSkills | null,
  session: { sessionId: string } | { resume: string },
): ClaudeProcess {
  const claude = new ClaudeProcess({
    conversationId: context.sessionId,
    start,
    session,
    model: context.model,
    containerName: context.containerName ?? null,
    skills,
  })
  keepClaudeProcess(claude)
  return claude
}

/**
 * The turn's message as the process taking it is given it. A picked skill's instruction may name a staged file, and
 * the file is in that process's own skills folder: a running process kept for the turn has the same skills, staged
 * in a folder of its own.
 */
function withTurnPrompt(context: RunContext, claude: ClaudeProcess): RunContext {
  return { ...context, prompt: turnPrompt(context, claude.skills?.invocable ?? []) }
}

/** Why the running process cannot take this turn, or null when it can. */
function replacementReason(running: ClaudeProcess, start: ClaudeStart): string | null {
  if (!running.alive) return 'it has ended'
  if (running.replaceBeforeNextTurn) return 'its last turn failed'
  if (running.fingerprint !== start.fingerprint) return 'its tools, prompt, skills or credential changed'
  const memoryMb = running.lastMemoryMb
  const ceiling = harnessMemoryCeilingMb()
  if (memoryMb !== null && memoryMb > ceiling) return `it holds ${Math.round(memoryMb)} MB, above ${ceiling} MB`
  return null
}

/**
 * The turn's context with the conversation's platform token in place of the
 * run's (adr-0082, spec §2). A process that lives across turns is started with
 * its token once, in its environment, where its platform-tool connection reads
 * it, so that token must be the conversation's, pointed at this turn's
 * capability now and at nothing once the turn ends.
 */
function withConversationToken(context: RunContext): RunContext {
  if (!context.gitCredEnv?.[PLATFORM_TOKEN_ENV] || !context.capability) return context
  const token = pointConversationToken(context.sessionId, context.runId, context.capability)
  return { ...context, gitCredEnv: { ...context.gitCredEnv, [PLATFORM_TOKEN_ENV]: token } }
}

function logLaunch(context: RunContext, sdkSessionId: string, skills: StagedTurnSkills | null): void {
  logger.info(`[launch] run=${context.runId} conversation=${context.sessionId} session=${sdkSessionId}`)
  logger.info(`[launch]   cwd        = ${context.cwd}`)
  logger.info(`[launch]   model      = ${context.model}`)
  logger.info(`[launch]   tools      = ${JSON.stringify(context.allowedTools?.map(p => `${p.name}:${p.state}`) ?? 'bypassed')}`)
  logger.info(`[launch]   mcpServers = ${context.mcpServers ? JSON.stringify(Object.entries(context.mcpServers).map(([k, v]) => `${k}=${v.url}`)) : 'none'}`)
  logger.info(`[launch]   skillsDir  = ${skills?.visibleDir ?? 'none'}`)
  logger.info(`[launch]   container  = ${context.containerName ? `docker(${context.containerName})` : 'local'}`)
}
